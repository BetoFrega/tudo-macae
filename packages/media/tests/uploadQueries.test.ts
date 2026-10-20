import { expect, test, vi } from "vitest";
import { createMediaUploadQueries } from "../uploadQueries";

const metadata = {
  kind: "article-image" as const, alt: "Orla de Macaé", caption: "", provenance: {
    origin: "own-production" as const, creator: "Equipe", credit: "Equipe", displayBasis: "own-production" as const, acquiredAt: 1000,
  },
};

test("returns the owner's persisted metadata through a controlled reader", async () => {
  const read = vi.fn(async () => ({ ownerId: "owner", metadata }));
  const queries = createMediaUploadQueries({ read });
  expect(await queries.metadata("owner", "reservation")).toEqual(metadata);
  expect(read).toHaveBeenCalledWith("reservation");
});

test("does not expose metadata to another owner", async () => {
  const queries = createMediaUploadQueries({ read: async () => ({ ownerId: "owner", metadata }) });
  await expect(queries.metadata("other", "reservation")).rejects.toMatchObject({ code: "forbidden", message: "O envio pertence a outro chamador." });
});

test("reports an absent reservation with the existing domain error", async () => {
  const queries = createMediaUploadQueries({ read: async () => null });
  await expect(queries.metadata("owner", "missing")).rejects.toMatchObject({ code: "notFound", message: "A reserva de envio não existe." });
});

test("reads a durable result using the finalization operation identity", async () => {
  const result = { status: "created" as const, mediaId: "media", digest: "digest" };
  const read = vi.fn(async () => ({ ownerId: "owner", metadata, finalizationId: "operation", result }));
  const queries = createMediaUploadQueries({ read });
  expect(await queries.readFinalized("owner", "operation", { reservationId: "reservation", idempotencyKey: "different-input-key" })).toEqual(result);
  expect(read).toHaveBeenCalledWith("reservation");
});

test("protects result reads with absence and ownership checks before finalization identity", async () => {
  const result = { status: "created" as const, mediaId: "media", digest: "digest" };
  const queries = createMediaUploadQueries({ read: async id => id === "missing" ? null : ({ ownerId: "owner", metadata, finalizationId: "original", result }) });
  await expect(queries.readFinalized("owner", "other", { reservationId: "missing", idempotencyKey: "key" })).rejects.toMatchObject({ code: "notFound" });
  await expect(queries.readFinalized("other", "other", { reservationId: "reservation", idempotencyKey: "key" })).rejects.toMatchObject({ code: "forbidden" });
});

test("rejects a competing finalization identity even before a result exists", async () => {
  const queries = createMediaUploadQueries({ read: async () => ({ ownerId: "owner", metadata, finalizationId: "original" }) });
  await expect(queries.readFinalized("owner", "other", { reservationId: "reservation", idempotencyKey: "original" })).rejects.toMatchObject({ code: "duplicate", message: "Finalize o envio com a mesma chave de idempotência." });
});

test("returns undefined for an unfinished reservation with no finalization identity", async () => {
  const queries = createMediaUploadQueries({ read: async () => ({ ownerId: "owner", metadata }) });
  expect(await queries.readFinalized("owner", "operation", { reservationId: "reservation", idempotencyKey: "key" })).toBeUndefined();
});

test.each(["created", "duplicate", "conflict"] as const)("returns durable %s results without adding state or expiry checks", async (status) => {
  const result = { status, mediaId: "media", digest: "digest" };
  const record = { ownerId: "owner", metadata, result, status: "expired", expiresAt: 1 };
  const queries = createMediaUploadQueries({ read: async () => record });
  expect(await queries.readFinalized("owner", "operation", { reservationId: "reservation", idempotencyKey: "key" })).toEqual(result);
  expect(record).toEqual({ ownerId: "owner", metadata, result, status: "expired", expiresAt: 1 });
});

test("propagates reader failures from both operations", async () => {
  const failure = new Error("reader unavailable");
  const queries = createMediaUploadQueries({ read: async () => {
    throw failure;
  } });
  await expect(queries.metadata("owner", "reservation")).rejects.toBe(failure);
  await expect(queries.readFinalized("owner", "operation", { reservationId: "reservation", idempotencyKey: "key" })).rejects.toBe(failure);
});
