import type * as entry from "../uploadPreparation";

export async function run(module: typeof entry) {
  const preparation = module.createMediaUploadPreparation({
    now: () => 1000,
    reservationId: () => "reservation",
    assertPrivateBucket: async () => {},
    store: { async transact(_id, decide) { return decide({ read: async () => null, create: () => {} }); } },
    sign: async reservation => ({ reservationId: reservation.id, expiresAt: reservation.expiresAt, upload: { url: "https://upload.invalid", method: "PUT", headers: {} } }),
  });
  const result = await preparation.prepare("owner", "operation", {
    idempotencyKey: "upload", size: 100, contentType: "image/png",
    metadata: { kind: "article-image", alt: "Praia", caption: "", provenance: {
      origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1,
    } },
  });
  if (result.expiresAt !== 601000) throw new Error("Unexpected reservation deadline");
}
