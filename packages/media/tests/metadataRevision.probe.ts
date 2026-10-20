import type * as entry from "../metadataRevision";

export async function run(module: typeof entry) {
  const metadata = { kind: "article-image" as const, alt: "Orla", caption: "", provenance: {
    origin: "own-production" as const, creator: "Equipe", credit: "Equipe", displayBasis: "own-production" as const, acquiredAt: 1,
  } };
  const transaction: entry.MediaRevisionTransaction = {
    read: async id => ({ id, ...metadata, status: "active", revision: 1, createdAt: 1, updatedAt: 1, storagePath: "media/image.webp", mimeType: "image/webp" }),
    archive: () => {}, update: () => {},
  };
  const revision = module.createMediaMetadataRevision({ now: () => 1000, store: { transact: decide => decide(transaction) } });
  const input = { id: "media", expectedRevision: 1, actorId: "editor", metadata };
  await revision.update(input);
  if ((await revision.coordinate(transaction, input)).status !== "updated") throw new Error("Coordinated revision failed");
}
