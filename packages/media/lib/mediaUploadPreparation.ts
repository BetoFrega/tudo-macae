import { sameUploadValue } from "./sameUploadValue";
import { MediaIngestionError, mediaUploadLimits, validatedMediaUpload, type PrepareMediaUploadInput } from "../ingestionPolicy";
import type { MediaUploadPreparationDependencies } from "../uploadPreparation";

export function buildMediaUploadPreparation(dependencies: MediaUploadPreparationDependencies) {
  return {
    async prepare(ownerId: string, operationId: string, input: PrepareMediaUploadInput) {
      await dependencies.assertPrivateBucket();
      const parsed = validatedMediaUpload(input);
      const id = dependencies.reservationId(operationId);
      const reservation = await dependencies.store.transact(id, async (transaction) => {
        const existing = await transaction.read();
        if (existing) {
          if (existing.ownerId !== ownerId || !sameUploadValue(existing.input, parsed)) {
            throw new MediaIngestionError("duplicate", "A chave já identifica outro envio de Mídia.");
          }
          return existing;
        }
        const now = dependencies.now();
        const record = { id, ownerId, input: parsed, createdAt: now, expiresAt: now + mediaUploadLimits.expiresAfterMs, cleanupAt: now + mediaUploadLimits.quarantineRetentionMs, cleanupPending: true, status: "prepared" as const };
        transaction.create(record);
        return record;
      });
      if (reservation.expiresAt <= dependencies.now()) {
        throw new MediaIngestionError("validationFailed", "A reserva de envio expirou. Prepare um novo envio.", { reservationExpired: true });
      }
      return dependencies.sign(reservation);
    },
  };
}
