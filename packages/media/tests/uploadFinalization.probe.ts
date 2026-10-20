import type * as entry from "../uploadFinalization";

export async function run(module: typeof entry) {
  let reservation: entry.MediaUploadReservation = {
    id: "a".repeat(64), ownerId: "owner", status: "prepared", createdAt: 1, expiresAt: 600000, cleanupAt: 86400000, cleanupPending: true,
    input: { idempotencyKey: "upload", size: 100, contentType: "image/png", metadata: { kind: "article-image", alt: "Praia", caption: "", provenance: { origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1 } } },
  };
  const finalization = module.createMediaUploadFinalization({
    now: () => 1000,
    store: { async transact(_id, decide) {
      return decide({
        read: async () => reservation, readCanonical: async () => null,
        update: (fields) => { reservation = { ...reservation, ...fields }; }, createMedia: () => "media",
      });
    } },
    readUpload: async () => new Uint8Array([1]),
    sanitize: async bytes => ({ bytes, digest: "digest" }),
    storeMedia: async () => "stored",
  });
  const result = await finalization.finalize("owner", "operation", { reservationId: reservation.id, idempotencyKey: "input-key" });
  if (result.status !== "created") throw new Error("Unexpected finalization result");
}
