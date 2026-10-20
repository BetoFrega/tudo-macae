import type * as entry from "../quarantineCleanup";

export async function run(module: typeof entry) {
  let pending = true;
  const cleanup = module.createQuarantineCleanup({
    now: () => 1000,
    remove: async () => {},
    store: {
      candidates: async () => pending ? ["reservation"] : [],
      transact: async (_id, decide) => decide({
        read: async () => ({ cleanupPending: pending, cleanupAt: 1000, status: "prepared" }),
        expire: () => {},
      }),
      markRemoved: async () => { pending = false; },
    },
  });
  const plan = await cleanup.plan();
  if (plan.reservationIds.length !== 1) throw new Error("Missing cleanup candidate");
  const result = await cleanup.sweep();
  if (result.removedReservationIds.length !== 1 || pending) throw new Error("Cleanup did not finish");
}
