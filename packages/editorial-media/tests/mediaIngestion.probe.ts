import { firstPartyEditorialCaller } from "@tudomacae/editorial-access/caller";
import type * as entry from "../mediaIngestion";

export async function run(module: typeof entry) {
  const intents = new Map<string, entry.MediaIngestionIntent>();
  const ingestion = module.createEditorialMediaIngestion({
    authorize: async () => {},
    hasMediaUsePermission: async () => true,
    async begin(caller, input, operation) {
      const id = `${operation === "prepare" ? "a" : "b"}`.repeat(64);
      const existing = intents.get(id);
      if (existing) return { id, ownerId: existing.ownerId };
      intents.set(id, { id, ownerId: "owner", caller, input, operation, status: "pending", createdAt: 1 });
      return { id, ownerId: "owner" };
    },
    async complete(id) {
      const intent = intents.get(id)!;
      intents.set(id, { ...intent, status: "completed" });
    },
    async read(_caller, id) {
      const intent = intents.get(id);
      if (!intent) throw new Error("Missing ingestion intent");
      return intent;
    },
    recordFailure: async () => {},
    async prepare() {
      return { reservationId: "b".repeat(64), expiresAt: 1_000, upload: { url: "https://upload.invalid", method: "PUT", headers: {} } };
    },
    readFinalized: async () => null,
    async metadata() { return uploadInput().metadata; },
    async finalize() { return { status: "created", mediaId: "media-1", digest: "digest" }; },
    async search() { return { media: [] }; },
    recordSearch: async () => {},
  });
  const caller = firstPartyEditorialCaller("editor-1");
  const prepared = await ingestion.prepare(caller, uploadInput());
  await ingestion.finalize(caller, { reservationId: prepared.reservationId, idempotencyKey: "finalize" });
  await ingestion.get(caller, prepared.correlationId);
  await ingestion.reconcile(caller, prepared.correlationId);
  await ingestion.search(caller, {});
}

function uploadInput() {
  return {
    idempotencyKey: "prepare", size: 1, contentType: "image/png" as const,
    metadata: {
      kind: "article-image" as const, alt: "Praia", caption: "",
      provenance: {
        origin: "own-production" as const, creator: "Equipe", credit: "Equipe",
        displayBasis: "own-production" as const, acquiredAt: 1,
      },
    },
  };
}
