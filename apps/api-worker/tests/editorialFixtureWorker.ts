import { z } from "zod";
import { createEditorialPersistence } from "../editorial";
import { recordKinds, type EditorialPersistence, type PersistenceMetrics } from "@tudomacae/editorial-persistence";

const key = z.object({ kind: z.enum(recordKinds), id: z.string(), namespace: z.string().optional() });
const inputSchema = z.object({
  action: z.enum(["read", "page", "transaction", "import", "importReceipt", "readReceipt", "snapshot", "expireActivity"]),
  kind: z.enum(recordKinds).optional(), id: z.string().optional(), namespace: z.string().optional(),
  query: z.unknown().optional(), version: z.number().optional(), now: z.number().optional(),
  /** Point reads performed before the writes; every written key is also read first. */
  reads: z.array(key).default([]),
  /** Queries paged inside the decision, guarding their scope. */
  pages: z.array(z.unknown()).default([]),
  records: z.array(z.unknown()).default([]),
  remove: z.array(key).default([]),
  intent: z.object({ actorId: z.string(), key: z.string(), operation: z.string(), input: z.json() }).nullable().default(null),
  result: z.json().default({ outcome: "saved" }),
  receipt: z.unknown().optional(),
  /** Pauses the first attempt after its decision until the test releases the gate. */
  barrier: z.string().optional(),
  /** Throws from the decision after reading, to prove nothing commits. */
  fail: z.boolean().default(false),
  /** Appends a failing statement to each commit batch, to prove the batch rolls back whole. */
  breakCommit: z.boolean().default(false),
});
type FixtureInput = z.infer<typeof inputSchema>;
type FixtureEnv = { EDITORIAL_DB: D1Database; GATE?: Fetcher };

async function transaction(input: FixtureInput, store: EditorialPersistence, env: FixtureEnv) {
  let attempts = 0;
  return store.transact(input.intent, async (tx) => {
    attempts++;
    const read = await Promise.all(input.reads.map(item => tx.read(item.kind, item.id, item.namespace)));
    const pages = await Promise.all(input.pages.map(query => tx.page(query as Parameters<typeof tx.page>[0])));
    for (const record of input.records) {
      const parsed = record as { kind: typeof recordKinds[number]; id: string; namespace?: string };
      await tx.read(parsed.kind, parsed.id, parsed.namespace);
      tx.put(record as Parameters<typeof tx.put>[0]);
    }
    for (const item of input.remove) {
      await tx.read(item.kind, item.id, item.namespace);
      tx.remove(item.kind, item.id, item.namespace);
    }
    if (input.fail) throw new Error("Decisão recusada.");
    if (input.barrier && attempts === 1) await env.GATE!.fetch(`http://gate/${input.barrier}`);
    return { ...(input.result as object), attempts, read: read.map(item => item?.version ?? null), pages: pages.map(item => item.items.map(record => record.id)) };
  });
}

function run(input: FixtureInput, store: EditorialPersistence, env: FixtureEnv) {
  switch (input.action) {
    case "read": return store.read(input.kind!, input.id!, input.namespace);
    case "page": return store.page(input.query as Parameters<EditorialPersistence["page"]>[0], input.version);
    case "transaction": return transaction(input, store, env);
    case "import": return Promise.all(input.records.map(record => store.importRecord(record as Parameters<EditorialPersistence["importRecord"]>[0])));
    case "importReceipt": return store.importReceipt(input.receipt as Parameters<EditorialPersistence["importReceipt"]>[0]);
    case "readReceipt": return store.readReceipt(input.intent!.actorId, input.intent!.key);
    case "expireActivity": return store.expireActivity(input.now!);
    case "snapshot": return store.snapshot(async reader => Promise.all(input.reads.map(item => reader.read(item.kind, item.id, item.namespace))));
  }
}

/** Appends a statement that violates the body CHECK to every batch that writes a record. */
function brokenDatabase(database: D1Database): D1Database {
  const writes = new WeakSet<D1PreparedStatement>();
  return new Proxy(database, { get(target, property) {
    if (property === "prepare") return (query: string) => {
      const statement = target.prepare(query);
      if (!query.startsWith("INSERT INTO editorial_records")) return statement;
      return new Proxy(statement, { get(inner, name) {
        if (name === "bind") return (...values: unknown[]) => {
          const bound = inner.bind(...values);
          writes.add(bound);
          return bound;
        };
        const value = Reflect.get(inner, name, inner);
        return typeof value === "function" ? value.bind(inner) : value;
      } });
    };
    if (property === "batch") return (statements: D1PreparedStatement[]) => target.batch(statements.some(item => writes.has(item))
      ? [...statements, target.prepare("INSERT INTO editorial_records (kind, id, body, version) VALUES ('article', 'broken', 'not json', 'v')")]
      : statements);
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

const worker = {
  async fetch(request: Request, env: FixtureEnv) {
    const input = inputSchema.parse(await request.json());
    const metrics: PersistenceMetrics[] = [];
    const store = createEditorialPersistence({ database: input.breakCommit ? brokenDatabase(env.EDITORIAL_DB) : env.EDITORIAL_DB, observe: value => void metrics.push(value) });
    try {
      return Response.json({ value: await run(input, store, env) ?? null, metrics });
    }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      return Response.json({ error: failure.name, message: failure.message, metrics });
    }
  },
};

export default worker;
