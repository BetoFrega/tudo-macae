import { sameUploadValue } from "./sameUploadValue";
import { MediaIngestionError, finalizeMediaUploadSchema, type FinalizedMediaUpload, type FinalizeMediaUploadInput } from "../ingestionPolicy";
import type { MediaUploadFinalizationDependencies } from "../uploadFinalization";

export function buildMediaUploadFinalization(dependencies: MediaUploadFinalizationDependencies) {
  return {
    async finalize(ownerId: string, operationId: string, input: FinalizeMediaUploadInput) {
      const parsed = finalizeMediaUploadSchema.safeParse(input);
      if (!parsed.success) throw new MediaIngestionError("validationFailed", "Informe uma reserva e chave de finalização válidas.");
      const reservation = await dependencies.store.transact(parsed.data.reservationId, async (transaction) => {
        const reservation = await transaction.read();
        if (!reservation) throw new MediaIngestionError("notFound", "A reserva de envio não existe.");
        if (reservation.ownerId !== ownerId) throw new MediaIngestionError("forbidden", "O envio pertence a outro chamador.");
        if (reservation.finalizationId && reservation.finalizationId !== operationId) {
          throw new MediaIngestionError("duplicate", "Finalize o envio com a mesma chave de idempotência.");
        }
        if (reservation.result) return reservation;
        if (reservation.status === "expired" || reservation.cleanupAt <= dependencies.now()
          || (reservation.status === "prepared" && reservation.expiresAt <= dependencies.now())) {
          throw new MediaIngestionError("validationFailed", "A reserva de envio expirou. Prepare um novo envio.", { reservationExpired: true });
        }
        transaction.update({ status: "finalizing", finalizationId: operationId });
        return { ...reservation, status: "finalizing" as const, finalizationId: operationId };
      });
      if (reservation.result) return reservation.result;
      const sanitized = await dependencies.sanitize(await dependencies.readUpload(reservation));
      const storagePath = await dependencies.storeMedia(sanitized.bytes, sanitized.digest);
      return dependencies.store.transact(reservation.id, async (transaction) => {
        const live = await transaction.read();
        if (!live) throw new MediaIngestionError("notFound", "A reserva de envio não existe.");
        if (live.result) return live.result;
        if (live.status !== "finalizing" || live.cleanupAt <= dependencies.now()) {
          throw new MediaIngestionError("validationFailed", "A reserva de envio expirou. Prepare um novo envio.", { reservationExpired: true });
        }
        const canonical = await transaction.readCanonical(sanitized.digest);
        let result: FinalizedMediaUpload;
        if (canonical) {
          result = { status: sameUploadValue(canonical.metadata, reservation.input.metadata) ? "duplicate" : "conflict", mediaId: canonical.id, digest: sanitized.digest };
        }
        else {
          const now = dependencies.now();
          const mediaId = transaction.createMedia({ ...reservation.input.metadata, status: "staged", revision: 1, storagePath, mimeType: "image/webp", digest: sanitized.digest, createdAt: now, updatedAt: now }, sanitized.digest);
          result = { status: "created", mediaId, digest: sanitized.digest };
        }
        transaction.update({ status: "finalized", result });
        return result;
      });
    },
  };
}
