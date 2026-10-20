import { expect, test, vi } from "vitest";
import { createMediaUploadPreparation, type MediaUploadReservation, type MediaUploadPreparationDependencies } from "../uploadPreparation";
import type { PrepareMediaUploadInput } from "../ingestionPolicy";

const input: PrepareMediaUploadInput = {
  idempotencyKey: "upload", size: 100, contentType: "image/png",
  metadata: { kind: "article-image", alt: "Praia", caption: "", provenance: {
    origin: "own-production", creator: "Equipe", credit: "Equipe", displayBasis: "own-production", acquiredAt: 1,
  } },
};

function fixture() {
  const records = new Map<string, MediaUploadReservation>();
  let time = 1000;
  const assertPrivateBucket = vi.fn(async () => {});
  const sign = vi.fn(async (record: MediaUploadReservation) => ({ reservationId: record.id, expiresAt: record.expiresAt, upload: { url: "https://upload.test", method: "PUT" as const, headers: {} } }));
  const store: MediaUploadPreparationDependencies["store"] = {
    async transact(id, decide) {
      let pending: MediaUploadReservation | undefined;
      const result = await decide({ read: async () => records.get(id) ?? null, create: (record) => {
        pending = record;
      } });
      if (pending) records.set(id, pending);
      return result;
    },
  };
  const transact = vi.spyOn(store, "transact");
  const preparation = createMediaUploadPreparation({
    now: () => time,
    reservationId: (operationId: string) => operationId,
    assertPrivateBucket, store, sign,
  });
  return { preparation, assertPrivateBucket, sign, transact, advance: (value: number) => {
    time = value;
  } };
}

test("replaying preparation reuses the reservation without renewing its deadline", async () => {
  const { preparation, advance } = fixture();
  const first = await preparation.prepare("owner", "operation", input);
  expect(first).toMatchObject({ reservationId: "operation", expiresAt: 601000 });
  advance(2000);
  expect(await preparation.prepare("owner", "operation", input)).toEqual(first);
});

test("a reservation rejects a different owner or changed input", async () => {
  const { preparation } = fixture();
  await preparation.prepare("owner", "operation", input);
  await expect(preparation.prepare("other", "operation", input)).rejects.toMatchObject({ code: "duplicate" });
  await expect(preparation.prepare("owner", "operation", { ...input, size: 101 })).rejects.toMatchObject({ code: "duplicate" });
  await expect(preparation.prepare("owner", "operation", { ...input, metadata: { ...input.metadata, alt: "Outra praia" } })).rejects.toMatchObject({ code: "duplicate" });
});

test("preparation expires exactly at its original deadline", async () => {
  const { preparation, advance, sign } = fixture();
  await preparation.prepare("owner", "operation", input);
  advance(600999);
  await expect(preparation.prepare("owner", "operation", input)).resolves.toHaveProperty("expiresAt", 601000);
  sign.mockClear();
  advance(601000);
  await expect(preparation.prepare("owner", "operation", input)).rejects.toMatchObject({ code: "validationFailed", details: { reservationExpired: true } });
  expect(sign).not.toHaveBeenCalled();
});

test("private bucket verification precedes validation and prevents reservation and signing", async () => {
  const { preparation, assertPrivateBucket, transact, sign } = fixture();
  const failure = new Error("Bucket unavailable");
  assertPrivateBucket.mockRejectedValue(failure);
  await expect(preparation.prepare("owner", "operation", { ...input, size: 0 })).rejects.toBe(failure);
  expect(transact).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
});

test("invalid upload input cannot reserve or sign", async () => {
  const { preparation, transact, sign } = fixture();
  await expect(preparation.prepare("owner", "operation", { ...input, size: 0 })).rejects.toMatchObject({ code: "validationFailed" });
  expect(transact).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
});

test("a signing failure leaves a durable reservation that can be retried", async () => {
  const { preparation, advance, sign } = fixture();
  const failure = new Error("Signing unavailable");
  sign.mockRejectedValueOnce(failure);
  await expect(preparation.prepare("owner", "operation", input)).rejects.toBe(failure);
  advance(2000);
  expect(await preparation.prepare("owner", "operation", input)).toMatchObject({ expiresAt: 601000 });
  expect(sign.mock.calls[1]?.[0]).toMatchObject({ createdAt: 1000, cleanupAt: 86401000, cleanupPending: true, status: "prepared", input });
});

test("equivalent metadata with different object key order reuses the reservation", async () => {
  const { preparation } = fixture();
  const first = await preparation.prepare("owner", "operation", input);
  const reordered = { ...input, metadata: { provenance: { ...input.metadata.provenance }, caption: "", alt: "Praia", kind: "article-image" as const } };
  expect(await preparation.prepare("owner", "operation", reordered)).toEqual(first);
});
