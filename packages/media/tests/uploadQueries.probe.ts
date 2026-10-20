import type * as entry from "../uploadQueries";

export async function run(module: typeof entry) {
  const queries = module.createMediaUploadQueries({ read: async () => ({
    ownerId: "owner",
    metadata: { kind: "article-image", alt: "Orla", caption: "", provenance: {
      origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1,
    } },
    finalizationId: "operation",
    result: { status: "created", mediaId: "media", digest: "digest" },
  }) });
  const metadata = await queries.metadata("owner", "reservation");
  if (metadata.alt !== "Orla") throw new Error("Metadata query failed");
  const result = await queries.readFinalized("owner", "operation", { reservationId: "reservation", idempotencyKey: "key" });
  if (result?.mediaId !== "media") throw new Error("Result query failed");
}
