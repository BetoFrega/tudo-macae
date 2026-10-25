import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { classifiedsReadOperations, classifiedsWriteOperations } from "@tudomacae/classifieds-client/protocol";
import { recordKinds, type PersistenceMetrics, type RecordQuery, type ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { createClassifiedsArtifactIndex, createClassifiedsRecordCodec } from "@tudomacae/classifieds-persistence/records";
import { isAdImagePath } from "@tudomacae/ads/imagePath";
import { adImageCleanupJobId } from "@tudomacae/ads/imageCleanupJob";
import { createClassifiedsTransfer } from "@tudomacae/classifieds-persistence/transfer";

const codec = createClassifiedsRecordCodec();
const artifactIndex = createClassifiedsArtifactIndex({ ownsImagePath: isAdImagePath, cleanupJobId: adImageCleanupJobId });
const querySchema = z.object({ kind: z.enum(recordKinds), profileId: z.string().optional(), advertiserOwnerId: z.string().optional(), categoryId: z.string().optional(), subcategoryId: z.string().optional(), status: z.string().optional(), completedPublication: z.boolean().optional(), ownerId: z.string().optional(), normalizedTitle: z.string().optional(), contact: z.string().optional(), after: z.string().optional(), limit: z.number().optional(), slug: z.string().optional(), claimable: z.boolean().optional(), activityArea: z.object({ categoryId: z.string(), subcategoryId: z.string() }).optional(), order: z.enum(["rank", "rankDesc", "createdDesc"]).optional() });
const inputSchema = z.object({
  action: z.enum(["read", "page", "transaction", "manifest", "delete", "import", "export", "seed", "expireAudits", "capability", "importRecords", "saveMany"]),
  operation: z.enum([...classifiedsReadOperations, ...classifiedsWriteOperations]).optional(), input: z.json().optional(),
  actor: z.object({ uid: z.string(), admin: z.boolean(), editor: z.boolean(), emailVerified: z.boolean().optional(), channel: z.literal("administration") }).optional(),
  kind: z.enum(recordKinds).optional(), id: z.string().optional(), namespace: z.string().optional(), query: querySchema.optional(), version: z.number().optional(),
  now: z.number().default(1_800_000_000_000), records: z.array(z.unknown()).default([]),
  remove: z.array(z.object({ kind: z.enum(recordKinds), id: z.string(), namespace: z.string().optional() })).default([]),
  intent: z.object({ actorId: z.string(), key: z.string(), operation: z.string(), input: z.json() }).nullable().default(null),
  audit: z.object({ reason: z.string(), channel: z.enum(["administration", "mcp"]).optional() }).default({ reason: "Solicitado", channel: "administration" }),
  correlationId: z.string().optional(), photoOperationId: z.string().optional(),
  barrier: z.string().optional(), barrierEveryAttempt: z.boolean().default(false), fail: z.boolean().default(false), lostResponse: z.boolean().default(false),
  merge: z.boolean().default(false), result: z.json().default({ outcome: "saved" }), item: z.unknown().optional(),
  count: z.number().int().min(0).max(10_000).default(0),
});

type FixtureInput = z.infer<typeof inputSchema>;
type FixtureEnv = { CLASSIFIEDS_DB: D1Database; GATE?: Fetcher };
type FixtureContext = { input: FixtureInput; store: ClassifiedsPersistence; env: FixtureEnv };
type FixtureRecord = ReturnType<typeof codec.parse>;
type Transaction = Parameters<Parameters<ClassifiedsPersistence["transact"]>[1]>[0];

function fixtureDatabase(request: Request, env: FixtureEnv) {
  if (request.headers.get("x-fixture-unavailable") !== "true") return env.CLASSIFIEDS_DB;
  return new Proxy(env.CLASSIFIEDS_DB, { get(target, property) {
    if (property === "prepare") return () => target.prepare("SELECT * FROM unavailable_fixture_table");
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

async function runCapability({ input, store, env }: FixtureContext) {
  let attempts = 0;
  const guarded: ClassifiedsPersistence = { ...store, transact: (intent, decide) => store.transact(intent, async (tx) => {
    const result = await decide(tx);
    if (input.barrier && attempts++ === 0) await env.GATE!.fetch(`http://gate/${input.barrier}`);
    return result;
  }) };
  const capability = createClassifiedsCapabilities({ persistence: guarded, actor: input.actor, correlationId: input.correlationId ?? crypto.randomUUID(), now: () => input.now, photoUrl: path => `https://photos.test/${encodeURIComponent(path)}` });
  const operation = input.operation!;
  return (classifiedsReadOperations as readonly string[]).includes(operation)
    ? await capability.read(z.enum(classifiedsReadOperations).parse(operation), input.input ?? null)
    : await capability.write(z.enum(classifiedsWriteOperations).parse(operation), input.input ?? null);
}

async function importRecords({ input, store }: FixtureContext) {
  for (const record of input.records) await store.importRecord(codec.parse(record));
  return { count: input.records.length };
}

async function saveMany({ input, store }: FixtureContext) {
  const records = input.records.map(record => codec.parse(record));
  for (let start = 0; start < records.length; start += 16) {
    const group = records.slice(start, start + 16);
    await store.transact(null, async (tx) => {
      await Promise.all(group.map(record => tx.read(record.kind, record.id, record.namespace)));
      for (const record of group) tx.put(record);
      return null;
    });
  }
  return { count: records.length };
}

function deleteIdentity({ input, store }: FixtureContext) {
  return store.deleteIdentity({ profileId: input.id!, expectedVersion: input.version!, now: input.now, intent: input.intent!, audit: input.audit, result: input.result, ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }), ...(input.photoOperationId === undefined ? {} : { photoOperationId: input.photoOperationId }) });
}

function seededAd(input: FixtureInput, id: string) {
  return { kind: "ad" as const, id, body: {
    userId: "fixture-owner", advertiserProfileId: input.id!, title: id, categoryId: "category",
    status: "active", createdAt: input.now, images: [{ path: `ad-images/${id}/photo.jpg`, order: 0 }],
    pendingImageCleanupClaims: Array.from({ length: 7 }, (_, n) => `ad-images/${id}/claim-${n}.jpg`),
    pendingImageUploadReservations: Array.from({ length: 5 }, (_, n) => ({ path: `ad-images/${id}/expired-${n}.jpg`, expiresAt: input.now - 1 })),
  } };
}

async function seed({ input, store }: FixtureContext) {
  // Growing associated set through the public adapter; no raw SQL fixture writes.
  for (let start = 0; start < input.count; start += 16) {
    await store.transact(null, async (tx) => {
      const ids = Array.from({ length: Math.min(16, input.count - start) }, (_, offset) => `${input.id}-${String(start + offset).padStart(6, "0")}`);
      await Promise.all(ids.map(id => tx.read("ad", id)));
      for (const id of ids) tx.put(seededAd(input, id));
      return null;
    });
  }
  return { count: input.count };
}

async function readTransactionScope(tx: Transaction, records: FixtureRecord[], input: FixtureInput) {
  const current = await Promise.all(records.map(record => tx.read(record.kind, record.id, record.namespace)));
  for (const item of input.remove) await tx.read(item.kind, item.id, item.namespace);
  if (input.query) await tx.page(input.query as RecordQuery);
  return current;
}

const mergedRecord = (record: FixtureRecord, current: Awaited<ReturnType<Transaction["read"]>> | undefined) =>
  ({ ...record, body: { ...current?.body, ...record.body } });

function runTransaction({ input, store, env }: FixtureContext) {
  const records = input.records.map(record => codec.parse(record));
  let attempts = 0;
  return store.transact(input.intent, async (tx) => {
    attempts++;
    const current = await readTransactionScope(tx, records, input);
    if (input.barrier && (attempts === 1 || input.barrierEveryAttempt)) await env.GATE!.fetch(`http://gate/${input.barrier}`);
    if (input.fail) throw new Error("fixture-decision-rejected");
    for (const [index, record] of records.entries()) tx.put(input.merge ? mergedRecord(record, current[index]) : record);
    for (const item of input.remove) tx.remove(item.kind, item.id, item.namespace);
    return { result: input.result, attempts };
  });
}

function exportResponse(store: ClassifiedsPersistence) {
  const iterator = createClassifiedsTransfer(store, artifactIndex).exportRecords();
  const stream = new ReadableStream({
    async pull(controller) {
      const item = await iterator.next();
      if (item.done) controller.close();
      else controller.enqueue(new TextEncoder().encode(`${JSON.stringify(item.value)}\n`));
    },
    async cancel() { await iterator.return(undefined); },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}

const fixtureActions: Record<Exclude<FixtureInput["action"], "export">, (context: FixtureContext) => Promise<unknown>> = {
  capability: runCapability,
  importRecords,
  saveMany,
  read: ({ input, store }) => store.read(input.kind!, input.id!, input.namespace),
  page: ({ input, store }) => store.page(input.query!, input.version),
  manifest: ({ input, store }) => store.manifest(input.id!, input.now),
  delete: deleteIdentity,
  expireAudits: ({ input, store }) => store.expireAudits(input.now),
  import: ({ input, store }) => createClassifiedsTransfer(store, artifactIndex).importItem(input.item, false),
  seed,
  transaction: runTransaction,
};

function fixtureError(error: unknown, metrics: PersistenceMetrics[]) {
  if (!(error instanceof Error)) return Response.json({ error: "UnknownError", message: "unknown", metrics }, { status: 409 });
  return Response.json({ error: error.name, message: error.message, ...("details" in error ? { details: error.details } : {}), metrics }, { status: 409 });
}

// Only built by the runtime tests, never the application entry.
const fixtureWorker = {
  async fetch(request: Request, env: FixtureEnv) {
    const metrics: PersistenceMetrics[] = [];
    const store = createClassifiedsPersistence({ database: fixtureDatabase(request, env), observe: (value) => {
      metrics.push(value);
    } });
    try {
      const input = inputSchema.parse(await request.json());
      if (input.action === "export") return exportResponse(store);
      const value = await fixtureActions[input.action]({ input, store, env });
      if (input.lostResponse) throw new Error("fixture-response-lost");
      return Response.json({ value: value ?? null, metrics });
    }
    catch (error) {
      return fixtureError(error, metrics);
    }
  },
};

export default fixtureWorker;
