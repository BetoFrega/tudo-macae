import { expect, test } from "vitest";
import { createReservedPhotoObjects, photoLeaseMs } from "../index";
import { reservedFixture } from "./objectReservationsFixture";

test("restart cannot retire an uncertain writer when journal confirmation was lost", async () => {
  const f = await reservedFixture();
  f.provider.upload = async () => {
    expect(f.reservation()?.claimUntil).toBe(f.dependencies.now() + 2 * photoLeaseMs);
    f.failJournal(true);
    throw new Error("private upload URL sentinel");
  };
  await expect(f.objects.create(f.record, f.bytes)).rejects.toMatchObject({ phase: "journal", operationId: f.record.operationId });
  f.failJournal(false);
  f.advance(photoLeaseMs + 1);
  const restarted = createReservedPhotoObjects(f.dependencies);
  await expect(restarted.retire(f.record)).rejects.toMatchObject({ code: "conflict" });
  expect(f.reservation()?.status).toBe("retiring");
  expect(f.reservation()?.id).toBe("image-1");
  f.advance(photoLeaseMs);
  await restarted.retire(f.record);
  await expect(restarted.create(f.record, f.bytes)).rejects.toMatchObject({ code: "retired" });
  expect(f.allocations()).toBe(1);
});

test("allocation and deletion failures retain bounded causes and recover using the original reservation", async () => {
  const f = await reservedFixture();
  const allocate = f.provider.allocate;
  f.provider.allocate = async () => {
    throw new Error("secret allocation URL");
  };
  await expect(f.objects.create(f.record, f.bytes)).rejects.toMatchObject({ phase: "allocation", operationId: f.record.operationId, message: "A operação da foto exige reconciliação. Tente novamente." });
  f.provider.allocate = allocate;
  const generation = await f.objects.create(f.record, f.bytes);
  expect(generation).toBe("image-1");
  const remove = f.provider.delete;
  f.provider.delete = async () => {
    throw new Error("secret deletion URL");
  };
  await expect(f.objects.retire(f.record)).rejects.toMatchObject({ phase: "deletion", operationId: f.record.operationId });
  expect(await f.objects.read(f.record)).toBeNull();
  f.provider.delete = remove;
  await f.objects.retire(f.record);
  await f.objects.retire(f.record);
  expect(f.allocations()).toBe(1);
});

test("a mismatched generation cannot retire the active object", async () => {
  const f = await reservedFixture();
  await f.objects.create(f.record, f.bytes);
  await expect(f.objects.retire({ ...f.record, generation: "other" })).rejects.toMatchObject({ code: "conflict" });
  expect(await f.objects.head(f.record)).toBe(true);
  expect(f.reservation()?.status).toBe("pending");
});

test("an acknowledged upload without verified bytes preserves verification attribution", async () => {
  const f = await reservedFixture();
  f.provider.upload = async () => {};
  await expect(f.objects.create(f.record, f.bytes)).rejects.toMatchObject({ phase: "verification", operationId: f.record.operationId });
  expect(f.reservation()?.claimUntil).toBe(f.dependencies.now() + 2 * photoLeaseMs);
});

test("an acknowledged deletion with a remaining object stays pending with deletion attribution", async () => {
  const f = await reservedFixture();
  await f.objects.create(f.record, f.bytes);
  f.provider.delete = async () => {};
  await expect(f.objects.retire(f.record)).rejects.toMatchObject({ phase: "deletion", operationId: f.record.operationId });
  expect(f.reservation()?.status).toBe("retiring");
});
