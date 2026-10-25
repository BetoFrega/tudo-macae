import { z } from "zod";
import type { EditorialPersistence, RecordInput } from "@tudomacae/editorial-persistence";
import { createEditorialPersistence } from "../editorial";
import { createEditorialBlog } from "../lib/editorialBlog";
import { createBlogSynchronization, type ArticleIndexWriter } from "../lib/editorialBlogSynchronization";
import { createEditorialMediaCleanup } from "../lib/editorialMediaCleanup";
import { createPublicBlog } from "@tudomacae/editorial-blog/publicBlog";
import { createPublicBlogStore } from "../lib/db/editorialPublicBlog";
import { reconcileArticleIndex, type ArticleIndexReconciler } from "../lib/editorialIndexReconciliation";

const inputSchema = z.object({
  action: z.enum(["import", "read", "list", "save", "takeOffline", "record", "grants", "indexed", "publicArticle", "publicPage", "reconcile", "drift"]),
  input: z.any().optional(),
  actorId: z.string().default("editor"),
  now: z.number().default(1_800_000_000_000),
  /** Pauses the first decision, after its reads and before its commit, until the test releases the gate. */
  barrier: z.string().optional(),
  /** Live operators; any other actor is refused. */
  operators: z.array(z.string()).default(["editor", "other"]),
  /** Public names of the identity owner. */
  names: z.record(z.string(), z.string()).default({}),
  /** `distribute` composes the Worker synchronization over an in-memory index with the writer's version rules. */
  synchronization: z.enum(["confirmed", "unconfirmed", "throw", "distribute"]).default("confirmed"),
  index: z.enum(["bound", "absent", "throw"]).default("bound"),
  /** `purge`, `purgeFailure` and `purgeStalled` compose the Worker's verified purge over a recording purger that succeeds, fails or never answers. */
  cleanup: z.enum(["confirmed", "unconfirmed", "purge", "purgeFailure", "purgeStalled"]).default("confirmed"),
});
type FixtureInput = z.infer<typeof inputSchema>;
type FixtureEnv = { EDITORIAL_DB: D1Database; GATE: Fetcher };

function held(persistence: EditorialPersistence, barrier: string | undefined, env: FixtureEnv): EditorialPersistence {
  if (!barrier) return persistence;
  let paused = false;
  return {
    ...persistence,
    transact: (intent, decide) => persistence.transact(intent, async (tx) => {
      const value = await decide(tx);
      if (!paused) {
        paused = true;
        await env.GATE.fetch(`http://gate/${barrier}`);
      }
      return value;
    }),
  };
}

type Summary = Parameters<ArticleIndexWriter["publish"]>[0];
// A fresh runtime per test resets this index.
const indexed = new Map<string, { updatedAt: number; summary?: Summary }>();
function memoryIndex(mode: FixtureInput["index"]): ArticleIndexReconciler | undefined {
  if (mode === "absent") return undefined;
  function apply(id: string, updatedAt: number, summary?: Summary) {
    if (mode === "throw") throw new Error("Índice indisponível.");
    const current = indexed.get(id);
    const deleted = summary === undefined;
    if (current && (current.updatedAt > updatedAt || (current.updatedAt === updatedAt && !current.summary && !deleted))) return Promise.resolve("stale" as const);
    indexed.set(id, { updatedAt, ...(summary ? { summary } : {}) });
    return Promise.resolve("confirmed" as const);
  }
  return { publish: async summary => apply(summary.id, summary.updatedAt, summary), retire: async (id, updatedAt) => apply(id, updatedAt),
    // The index Worker's order: newest publication first, then article ID descending.
    summaries: async () => [...indexed.values()].flatMap(entry => (entry.summary ? [entry.summary] : []))
      .sort((left, right) => right.publishedAt - left.publishedAt || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0)) };
}

/** Commits `record` to D1 while the repair retires it, without synchronizing the index, as a failed save would. */
function changingDuringRetire(index: ArticleIndexReconciler, persistence: EditorialPersistence, record: RecordInput | undefined): ArticleIndexReconciler {
  if (!record) return index;
  let committed = false;
  return { ...index, async retire(id, updatedAt, correlationId) {
    if (id === record.id && !committed) {
      committed = true;
      await commit(persistence, record);
    }
    return index.retire(id, updatedAt, correlationId);
  } };
}

/** Commits `record` to D1 between the canonical scan and the repair, publishing it to the index only when asked. */
function changingDuringRepair(index: ArticleIndexReconciler, persistence: EditorialPersistence, record: (RecordInput & { body: Omit<Summary, "id"> }) | undefined, publish: boolean): ArticleIndexReconciler {
  if (!record) return index;
  let reads = 0;
  return { ...index, async summaries() {
    // The first read compares; the second starts the repair.
    if (++reads === 2) {
      await commit(persistence, record);
      const { storyId, title, slug, mediaIds, publishedAt, updatedAt } = record.body;
      if (publish) await index.publish({ id: record.id, storyId, title, slug, mediaIds, publishedAt, updatedAt });
    }
    return index.summaries();
  } };
}

/** Commits `record` to D1 while the repair publishes it, without synchronizing the index, as a failed save would. */
function changingDuringPublish(index: ArticleIndexReconciler, persistence: EditorialPersistence, record: RecordInput | undefined): ArticleIndexReconciler {
  if (!record) return index;
  let committed = false;
  return { ...index, async publish(summary, correlationId) {
    if (summary.id === record.id && !committed) {
      committed = true;
      await commit(persistence, record);
    }
    return index.publish(summary, correlationId);
  } };
}

async function commit(persistence: EditorialPersistence, record: RecordInput) {
  await persistence.transact(null, async (tx) => {
    await tx.read(record.kind, record.id);
    tx.put(record);
    return null;
  });
}

/** The bound index, wrapped so the D1 changes `value` names commit at the repair step they race. */
function racingIndex(index: ArticleIndexReconciler, persistence: EditorialPersistence, value: Record<string, RecordInput & { body: Omit<Summary, "id"> }> = {}) {
  const repaired = changingDuringRepair(index, persistence, value.publishDuringRepair ?? value.withdrawDuringRepair, !!value.publishDuringRepair);
  const published = changingDuringPublish(repaired, persistence, value.withdrawDuringPublish ?? value.editDuringPublish);
  return changingDuringRetire(published, persistence, value.republishDuringRetire);
}

function cleanup(input: FixtureInput, persistence: EditorialPersistence, purged: string[][]) {
  if (input.cleanup === "confirmed" || input.cleanup === "unconfirmed") return async () => input.cleanup as "confirmed" | "unconfirmed";
  const succeeds = input.cleanup === "purge";
  const media = createEditorialMediaCleanup({ persistence, context: { environment: "test", release: "test" }, now: () => input.now, budgetMs: 50,
    purge: async (keys) => {
      purged.push(keys);
      if (input.cleanup === "purgeStalled") return new Promise(() => {});
      return succeeds ? { success: true } : { success: false, cause: "provider" };
    } });
  return async (id: string, correlationId?: string) => (await media.synchronize(id, correlationId)).status;
}

async function run(input: FixtureInput, env: FixtureEnv) {
  const base = createEditorialPersistence({ database: env.EDITORIAL_DB });
  const persistence = held(base, input.barrier, env);
  const synchronized: string[] = [];
  const purged: string[][] = [];
  const blog = createEditorialBlog({
    persistence, now: () => input.now, newId: () => "new-post",
    identity: {
      isOperator: async id => input.operators.includes(id),
      displayName: async id => input.names[id],
    },
    synchronize: input.synchronization === "distribute"
      ? createBlogSynchronization({ persistence: base, index: memoryIndex(input.index), cleanup: cleanup(input, base, purged), context: { environment: "test", release: "test" } })
      : async (id) => {
        synchronized.push(id);
        if (input.synchronization === "throw") throw new Error("Distribuição indisponível.");
        return input.synchronization === "unconfirmed" ? "unconfirmed" : "confirmed";
      },
  });
  const value = input.input;
  const reader = () => createPublicBlog({ now: () => input.now, ...createPublicBlogStore(base, async id => input.names[id]) });
  const actions: Record<FixtureInput["action"], () => Promise<unknown>> = {
    import: async () => Promise.all((value as RecordInput[]).map(record => base.importRecord(record))),
    read: () => blog.read(input.actorId, value),
    list: () => blog.list(input.actorId, value),
    save: async () => ({ ...await blog.save(input.actorId, value), synchronized, purged }),
    takeOffline: async () => ({ ...await blog.takeOffline(input.actorId, value), synchronized, purged }),
    record: () => base.read(value.kind, value.id, value.namespace),
    indexed: async () => Object.fromEntries(indexed),
    publicArticle: () => reader().article(value),
    publicPage: () => reader().page(value),
    reconcile: () => reconcileArticleIndex(base, racingIndex(memoryIndex("bound")!, base, value ?? undefined), "reconciliation"),
    /** Writes the index directly, as a lost or foreign write would, bypassing the D1. */
    drift: async () => indexed.set(value.id, value.summary ? { updatedAt: value.summary.updatedAt, summary: value.summary } : { updatedAt: value.updatedAt }),
    grants: async () => (await base.page({ kind: "publicationGrant", articleId: value })).items.map(item => item.body),
  };
  return actions[input.action]();
}

const worker = {
  async fetch(request: Request, env: FixtureEnv) {
    try {
      return Response.json({ value: await run(inputSchema.parse(await request.json()), env) ?? null });
    }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      return Response.json({ error: failure.name, message: failure.message, code: (failure as { code?: string }).code, details: (failure as { field?: string }).field });
    }
  },
};

export default worker;
