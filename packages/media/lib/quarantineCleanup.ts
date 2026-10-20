import type { QuarantineCleanupDependencies } from "../quarantineCleanup";

function validateLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("A limpeza aceita entre 1 e 100 reservas por página.");
  }
}

/** A sweep that cleaned what it could; failed reservations stay pending for the next run. */
export class QuarantineSweepIncomplete extends Error {
  constructor(
    readonly removedReservationIds: string[],
    readonly failedReservationIds: string[],
    readonly hasMore: boolean,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : "A limpeza da quarentena falhou.", { cause });
    this.name = "QuarantineSweepIncomplete";
  }
}

export function buildQuarantineCleanup({ store, now, remove }: QuarantineCleanupDependencies) {
  return {
    async sweep(limit = 100) {
      validateLimit(limit);
      const candidates = await store.candidates(now(), limit);
      const removedReservationIds: string[] = [];
      const failures: { id: string; error: unknown }[] = [];
      // One reservation that keeps failing must not hold back the ones after it.
      for (const id of candidates) {
        try {
          const eligible = await store.transact(id, async (transaction) => {
            const reservation = await transaction.read();
            if (!reservation.cleanupPending || reservation.cleanupAt > now()) return false;
            if (reservation.status !== "finalized") transaction.expire();
            return true;
          });
          if (!eligible) continue;
          await remove(id);
          await store.markRemoved(id, now());
          removedReservationIds.push(id);
        }
        catch (error) {
          failures.push({ id, error });
        }
      }
      const hasMore = candidates.length === limit;
      if (failures.length) throw new QuarantineSweepIncomplete(removedReservationIds, failures.map(failure => failure.id), hasMore, failures[0]!.error);
      return { removedReservationIds, hasMore };
    },
    async plan(limit = 100) {
      validateLimit(limit);
      return { reservationIds: await store.candidates(now(), limit) };
    },
  };
}
