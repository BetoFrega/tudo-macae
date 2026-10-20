import type { MediaUploadQueryDependencies } from "../uploadQueries";
import { MediaIngestionError, type FinalizeMediaUploadInput } from "../ingestionPolicy";

export function buildMediaUploadQueries({ read }: MediaUploadQueryDependencies) {
  async function readOwned(ownerId: string, reservationId: string) {
    const reservation = await read(reservationId);
    if (!reservation) throw new MediaIngestionError("notFound", "A reserva de envio não existe.");
    if (reservation.ownerId !== ownerId) throw new MediaIngestionError("forbidden", "O envio pertence a outro chamador.");
    return reservation;
  }

  return {
    async readFinalized(ownerId: string, operationId: string, input: FinalizeMediaUploadInput) {
      const reservation = await readOwned(ownerId, input.reservationId);
      if (reservation.finalizationId && reservation.finalizationId !== operationId) {
        throw new MediaIngestionError("duplicate", "Finalize o envio com a mesma chave de idempotência.");
      }
      return reservation.result;
    },
    async metadata(ownerId: string, reservationId: string) {
      const reservation = await readOwned(ownerId, reservationId);
      return reservation.metadata;
    },
  };
}
