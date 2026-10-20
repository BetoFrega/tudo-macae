import { expect, test, vi } from "vitest";
import { createQuarantineCleanup, QuarantineSweepIncomplete } from "../quarantineCleanup";

test("planning uses the deadline and default limit without deleting objects", async () => {
  const candidates = vi.fn(async () => ["reservation"]);
  const remove = vi.fn(async () => {});
  const cleanup = createQuarantineCleanup({
    now: () => 1000, remove,
    store: { candidates, transact: async () => false, markRemoved: async () => {} },
  });
  expect(await cleanup.plan()).toEqual({ reservationIds: ["reservation"] });
  expect(candidates).toHaveBeenCalledWith(1000, 100);
  expect(remove).not.toHaveBeenCalled();
});

test("sweep expires eligible work before deletion and marks progress afterwards", async () => {
  const effects: string[] = [];
  const cleanup = createQuarantineCleanup({
    now: () => 1000,
    remove: async (id) => { effects.push(`remove:${id}`); },
    store: {
      candidates: async () => ["reservation"],
      transact: async (_id, decide) => decide({ read: async () => ({ cleanupPending: true, cleanupAt: 1000, status: "prepared" }), expire: () => { effects.push("expire"); } }),
      markRemoved: async (id, time) => { effects.push(`marked:${id}:${time}`); },
    },
  });
  expect(await cleanup.sweep(1)).toEqual({ removedReservationIds: ["reservation"], hasMore: true });
  expect(effects).toEqual(["expire", "remove:reservation", "marked:reservation:1000"]);
});

test.each([
  { cleanupPending: false, cleanupAt: 1000, status: "prepared", removed: false },
  { cleanupPending: true, cleanupAt: 1001, status: "prepared", removed: false },
  { cleanupPending: true, cleanupAt: 1000, status: "finalized", removed: true },
])("rechecks eligibility without changing finalized state: %j", async (record) => {
  const expire = vi.fn();
  const remove = vi.fn(async () => {});
  const markRemoved = vi.fn(async () => {});
  const cleanup = createQuarantineCleanup({ now: () => 1000, remove, store: {
    candidates: async () => ["reservation"],
    transact: async (_id, decide) => decide({ read: async () => record, expire }),
    markRemoved,
  } });
  expect(await cleanup.sweep(1)).toEqual({ removedReservationIds: record.removed ? ["reservation"] : [], hasMore: true });
  expect(expire).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(record.removed ? 1 : 0);
  expect(markRemoved).toHaveBeenCalledTimes(record.removed ? 1 : 0);
});

test.each([0, -1, 101, 1.5, NaN, Infinity])("rejects invalid batch size %s before effects", async (limit) => {
  const candidates = vi.fn(async () => []);
  const cleanup = createQuarantineCleanup({ now: () => 1000, remove: async () => {}, store: {
    candidates, transact: async () => false, markRemoved: async () => {},
  } });
  for (const operation of [cleanup.plan, cleanup.sweep]) {
    await expect(operation(limit)).rejects.toThrow(new TypeError("A limpeza aceita entre 1 e 100 reservas por página."));
  }
  expect(candidates).not.toHaveBeenCalled();
});

test.each(["remove", "mark"])("a %s failure keeps its reservation pending without holding back the rest", async (failure) => {
  const pending = new Set(["first", "second"]);
  const objects = new Set(pending);
  const attempts: string[] = [];
  let fail = true;
  const cleanup = createQuarantineCleanup({ now: () => 1000,
    remove: async (id) => {
      attempts.push(id);
      if (fail && id === "first" && failure === "remove") throw new Error("storage unavailable");
      objects.delete(id);
    },
    store: {
      candidates: async () => [...pending],
      transact: async (_id, decide) => decide({ read: async () => ({ cleanupPending: true, cleanupAt: 999, status: "expired" }), expire: () => {} }),
      markRemoved: async (id) => {
        if (fail && id === "first" && failure === "mark") throw new Error("database unavailable");
        pending.delete(id);
      },
    },
  });
  const incomplete = cleanup.sweep();
  await expect(incomplete).rejects.toThrow("unavailable");
  await expect(incomplete).rejects.toMatchObject({ removedReservationIds: ["second"], failedReservationIds: ["first"], hasMore: false });
  await expect(incomplete).rejects.toBeInstanceOf(QuarantineSweepIncomplete);
  expect([...pending]).toEqual(["first"]);
  expect(attempts).toEqual(["first", "second"]);
  expect(objects.has("first")).toBe(failure === "remove");
  fail = false;
  expect(await cleanup.sweep()).toEqual({ removedReservationIds: ["first"], hasMore: false });
  expect(pending.size).toBe(0);
  expect(objects.size).toBe(0);
});

test("transaction retries re-evaluate current state and time", async () => {
  let now = 999;
  const remove = vi.fn(async () => {});
  const expire = vi.fn();
  const cleanup = createQuarantineCleanup({ now: () => now, remove, store: {
    candidates: async () => ["reservation"],
    transact: async (_id, decide) => {
      const read = async () => ({ cleanupPending: true, cleanupAt: 1000, status: "prepared" });
      expect(await decide({ read, expire })).toBe(false);
      now = 1000;
      return decide({ read, expire });
    },
    markRemoved: async () => {},
  } });
  expect(await cleanup.sweep()).toEqual({ removedReservationIds: ["reservation"], hasMore: false });
  expect(expire).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith("reservation");
});
