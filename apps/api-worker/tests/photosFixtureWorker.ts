import { z } from "zod";
import { classifiedsReadInput, classifiedsWriteInput } from "@tudomacae/classifieds-client/protocol";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { createClassifiedsPhotoPurge, createClassifiedsPhotos, createD1PhotoStore, createR2PhotoObjects, createClassifiedsPhotoDecoder, createClassifiedsPhotoSanitizer } from "../classifiedsPhotos";
import { createPhotoLifecycle } from "@tudomacae/classifieds-photos";
import { createPhotoTransfer } from "@tudomacae/classifieds-photos/transfer";
import { createHash } from "node:crypto";
import { createClassifiedsRecordCodec } from "@tudomacae/classifieds-persistence/records";
import { recordKinds } from "@tudomacae/classifieds-persistence";
import productionWorker, { createApiWorker } from "../index";
const actor = { uid: "owner", admin: false };
const inputSchema = z.object({ action: z.enum(["save", "upload", "reserve", "remove", "read", "sweep", "manifest", "delete", "adminDelete", "transfer", "publication", "capability", "record", "records", "heads", "sanitize"]),
  kind: z.enum(recordKinds).optional(), id: z.string().optional(), namespace: z.string().optional(), paths: z.array(z.string()).default([]),
  capability: z.object({ mutation: z.boolean(), operation: z.string(), input: z.json().default(null) }).optional(),
  actor: z.object({ uid: z.string(), admin: z.boolean(), editor: z.boolean(), emailVerified: z.boolean(), channel: z.literal("administration") }).optional(),
  request: z.object({ ownerKind: z.enum(["ad", "profile"]), ownerId: z.string(), operationId: z.string(), expectedRevision: z.number(), pendingPublication: z.literal(true).optional(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]), bytes: z.array(z.number()) }).optional(),
  path: z.string().default(""), ownerId: z.string().default("profile"), now: z.number().default(1_800_000_000_000),
  records: z.array(z.unknown()).default([]), gate: z.string().optional(), fault: z.enum(["bytes", "purge", "verify", "authorization", "rate_limit", "timeout", "transport"]).optional(), private: z.boolean().default(false),
  inventory: z.unknown().optional(), dryRun: z.boolean().default(true), bytes: z.array(z.number()).default([]), generation: z.string().default("source-1"),
});
type FixtureInput = z.infer<typeof inputSchema>;
type FixtureEnv = { CLASSIFIEDS_DB: D1Database; PHOTOS: R2Bucket; GATE: Fetcher; IMAGES: ImagesBinding };
type PhotoOptions = Parameters<typeof createClassifiedsPhotos>[0] & { now: () => number };
type PhotoStore = ReturnType<typeof createD1PhotoStore>;
type FixtureContext = {
  input: FixtureInput;
  env: FixtureEnv;
  persistence: ReturnType<typeof createClassifiedsPersistence>;
  store: PhotoStore;
  objects: ReturnType<typeof createR2PhotoObjects>;
  lifecycle: ReturnType<typeof createPhotoLifecycle>;
  now: () => number;
};

const purgeFailures = ["purge", "authorization", "rate_limit", "timeout"];
const sha256 = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fixturePurge(input: FixtureInput, store: PhotoStore, events: object[]) {
  return createClassifiedsPhotoPurge({ store, adapter: { isConfigured: () => true, purge: async (target) => {
    events.push({ operation: "purge", layer: target.layer, tagCount: target.tags.length, fileCount: target.files.length });
    events.push({ operation: "fixtureTargets", files: target.files });
    if (input.fault === "transport") throw new Error("Fixture transport error with private details");
    const cause = input.fault === "authorization" || input.fault === "rate_limit" || input.fault === "timeout" ? input.fault : "provider";
    return { success: !purgeFailures.includes(input.fault ?? ""), cause, retryable: false };
  } }, classifiedsOrigin: "https://photos.test", wait: async () => {}, verifyVisibility: async () => input.fault !== "verify" });
}

/** Gated or faulty uploads wrap R2 object creation; otherwise the production composition is used. */
function fixtureLifecycle({ input, env, store, objects }: Omit<FixtureContext, "lifecycle" | "persistence" | "now">, options: PhotoOptions) {
  if (!input.gate && input.fault !== "bytes") return createClassifiedsPhotos(options);
  return createPhotoLifecycle({ ...options, store, decode: createClassifiedsPhotoDecoder(env.IMAGES),
    objects: { ...objects, async create(record, bytes) {
      if (input.gate) await env.GATE.fetch(`http://gate/${input.gate}`);
      const result = await objects.create(record, bytes);
      if (input.fault === "bytes") throw new Error("Fixture lost R2 response");
      return result;
    } }, digest: sha256, newId: () => crypto.randomUUID() });
}

async function readHeads({ input, env }: FixtureContext) {
  return Promise.all(input.paths.map(async (path) => {
    const object = await env.PHOTOS.head(path);
    return object ? { size: object.size, customMetadata: object.customMetadata } : null;
  }));
}

async function runCapability({ input, env, persistence, lifecycle, now }: FixtureContext) {
  const capability = createClassifiedsCapabilities({ persistence, actor: input.actor ?? { ...actor, editor: false, emailVerified: true, channel: "administration" },
    correlationId: "fixture", now, photos: { ...lifecycle, async publication(who, id) {
      const proof = await lifecycle.publication(who, id);
      if (input.gate) await env.GATE.fetch(`http://gate/${input.gate}`);
      return proof;
    } } });
  const request = input.capability!;
  return request.mutation ? await capability.write(classifiedsWriteInput.parse({ operation: request.operation, input: request.input }).operation, request.input) : await capability.read(classifiedsReadInput.parse({ operation: request.operation, input: request.input }).operation, request.input);
}

function saveRecords({ input, persistence }: FixtureContext) {
  return persistence.transact(null, async (tx) => {
    for (const source of input.records) {
      const record = createClassifiedsRecordCodec().parse(source);
      await tx.read(record.kind, record.id, record.namespace);
      tx.put(record);
    }
    return null;
  });
}

async function readPhoto({ input, lifecycle }: FixtureContext) {
  const result = await lifecycle.read(input.path, input.private ? actor : undefined);
  return result ? { bytes: [...result.bytes], mimeType: result.mimeType } : null;
}

async function adminDelete({ input, persistence, now }: FixtureContext) {
  const profile = (await persistence.read("profile", input.ownerId))!;
  return createClassifiedsCapabilities({ persistence, actor: { uid: "admin", admin: true, editor: false, channel: "administration" }, correlationId: "fixture", now }).write("profiles.admin.delete", { id: input.ownerId, expectedRevision: profile.body.revision, idempotencyKey: input.ownerId });
}

async function deleteIdentity({ input, persistence }: FixtureContext) {
  const manifest = await persistence.manifest(input.ownerId, input.now);
  return persistence.deleteIdentity({ profileId: input.ownerId, expectedVersion: manifest.version, now: input.now,
    intent: { actorId: "admin", key: input.ownerId, operation: "deleteIdentity", input: { id: input.ownerId } }, audit: { reason: "Fixture" }, result: { status: "scheduled" } });
}

function transferPhoto({ input, store, objects, now }: FixtureContext) {
  return createPhotoTransfer({ store, objects, now, digest: sha256, source: async () => ({ bytes: new Uint8Array(input.bytes), generation: input.generation, mimeType: "image/png" }) }).importItem(input.inventory, input.dryRun);
}

const photoActions: Record<FixtureInput["action"], (context: FixtureContext) => Promise<unknown>> = {
  record: ({ input, persistence }) => persistence.read(input.kind!, input.id!, input.namespace),
  records: ({ input, persistence }) => persistence.page({ kind: input.kind! }),
  heads: readHeads,
  capability: runCapability,
  save: saveRecords,
  reserve: ({ input, lifecycle }) => lifecycle.reserve(actor, { ...input.request!, bytes: new Uint8Array(input.request!.bytes) }),
  upload: ({ input, lifecycle }) => lifecycle.upload(actor, { ...input.request!, bytes: new Uint8Array(input.request!.bytes) }),
  read: readPhoto,
  remove: ({ input, lifecycle }) => lifecycle.remove(actor, input.path),
  publication: ({ lifecycle }) => lifecycle.publication(actor, "ad"),
  sweep: ({ lifecycle }) => lifecycle.sweep(),
  manifest: ({ input, persistence }) => persistence.manifest(input.ownerId, input.now),
  adminDelete,
  delete: deleteIdentity,
  transfer: transferPhoto,
  sanitize: async ({ input, env }) => {
    const result = await createClassifiedsPhotoSanitizer(env.IMAGES)(new Uint8Array(input.bytes), input.private ? undefined : 16_000_000);
    return { ...result, bytes: [...result.bytes] };
  },
};

function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? error.code : undefined;
}

const fixtureWorker = {
  async scheduled(controller: ScheduledController, env: Env & { PHOTOS: R2Bucket; IMAGES: ImagesBinding; QUALIFICATION?: string; MAINTENANCE_FAULT?: string }, context: ExecutionContext) {
    if (env.QUALIFICATION === "production") return productionWorker.scheduled(controller, env, context);
    await createApiWorker({
      classifiedsPersistence: () => {
        if (env.MAINTENANCE_FAULT === "audits") throw new Error("Fixture audit expiry unavailable");
        return createClassifiedsPersistence({ database: env.CLASSIFIEDS_DB });
      },
      classifiedsQualification: async () => {
        if (env.QUALIFICATION === "unavailable") throw new Error("Fixture qualification unavailable");
        return env.QUALIFICATION !== "off";
      },
      classifiedsPhotos: () => {
        if (env.MAINTENANCE_FAULT === "photos") throw new Error("Fixture photo sweep unavailable");
        return createClassifiedsPhotos({ database: env.CLASSIFIEDS_DB, bucket: env.PHOTOS, images: env.IMAGES,
          now: () => controller.scheduledTime, purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: () => {} });
      },
      classifiedsSupplySnapshot: () => {
        if (env.MAINTENANCE_FAULT === "supply") throw new Error("Fixture supply snapshot unavailable");
        return undefined;
      },
    }).scheduled(controller, env);
  },
  async fetch(request: Request, env: FixtureEnv) {
    const events: object[] = [];
    const input = inputSchema.parse(await request.json());
    const persistence = createClassifiedsPersistence({ database: env.CLASSIFIEDS_DB });
    const store = createD1PhotoStore(env.CLASSIFIEDS_DB, persistence);
    const now = () => input.now;
    const options = { database: env.CLASSIFIEDS_DB, bucket: env.PHOTOS, images: env.IMAGES, now,
      purge: fixturePurge(input, store, events),
      observe: (event: object) => { events.push(event); } };
    const objects = createR2PhotoObjects(env.PHOTOS);
    const lifecycle = fixtureLifecycle({ input, env, store, objects }, options);
    try {
      const value = await photoActions[input.action]({ input, env, persistence, store, objects, lifecycle, now });
      return Response.json({ value, events });
    }
    catch (error) {
      return Response.json({ error: error instanceof Error ? error.name : "unknown", code: errorCode(error), events }, { status: 409 });
    }
  },
};
export default fixtureWorker;
