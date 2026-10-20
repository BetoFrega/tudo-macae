import { expect, test } from "vitest";
import { createMediaUploadFinalization } from "../uploadFinalization";

test("a missing reservation rejects before reading upload bytes", async () => {
  let read = false;
  const finalization = createMediaUploadFinalization({
    now: () => 1000,
    store: { async transact(_id, decide) {
      return decide({
        read: async () => null, readCanonical: async () => null,
        update: () => {}, createMedia: () => "media",
      });
    } },
    readUpload: async () => {
      read = true;
      return new Uint8Array();
    },
    sanitize: async bytes => ({ bytes, digest: "digest" }),
    storeMedia: async () => "stored",
  });
  await expect(finalization.finalize("owner", "operation", { reservationId: "a".repeat(64), idempotencyKey: "input-key" })).rejects.toMatchObject({ code: "notFound" });
  expect(read).toBe(false);
});

import { finalizationFixture, finalizeInput } from "./uploadFinalizationFixtures";

test("finalization creates private media and replays the durable result without I/O", async () => {
  const fixture = finalizationFixture();
  const result = await fixture.finalization.finalize("owner", "operation", finalizeInput);
  expect(result).toEqual({ status: "created", mediaId: "media", digest: "digest" });
  expect(fixture.created).toEqual([{ ...fixture.metadata, status: "staged", revision: 1, storagePath: "media-staged/digest.webp", mimeType: "image/webp", digest: "digest", createdAt: 1000, updatedAt: 1000 }]);
  expect(await fixture.finalization.finalize("owner", "operation", finalizeInput)).toEqual(result);
  expect(fixture.readUpload).toHaveBeenCalledTimes(1);
});

test("ownership and the operation key are checked before replaying a durable result", async () => {
  const fixture = finalizationFixture();
  await fixture.finalization.finalize("owner", "operation", finalizeInput);
  await expect(fixture.finalization.finalize("other", "operation", finalizeInput)).rejects.toMatchObject({ code: "forbidden" });
  await expect(fixture.finalization.finalize("owner", "different", finalizeInput)).rejects.toMatchObject({ code: "duplicate" });
  expect(fixture.readUpload).toHaveBeenCalledTimes(1);
});

test("prepared uploads expire at the upload deadline but started finalizations can resume", async () => {
  const expired = finalizationFixture();
  expired.advance(600000);
  await expect(expired.finalization.finalize("owner", "operation", finalizeInput)).rejects.toMatchObject({ code: "validationFailed", details: { reservationExpired: true } });
  expect(expired.readUpload).not.toHaveBeenCalled();
  const valid = finalizationFixture();
  valid.advance(599999);
  await expect(valid.finalization.finalize("owner", "operation", finalizeInput)).resolves.toHaveProperty("status", "created");
  const resumed = finalizationFixture();
  resumed.seed({ status: "finalizing", finalizationId: "operation" });
  resumed.advance(86399999);
  await expect(resumed.finalization.finalize("owner", "operation", finalizeInput)).resolves.toHaveProperty("status", "created");
});

test("cleanup deadline prevents starting or committing, while durable results survive expiry", async () => {
  const fixture = finalizationFixture();
  fixture.seed({ status: "finalizing", finalizationId: "operation" });
  fixture.advance(86400000);
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).rejects.toMatchObject({ details: { reservationExpired: true } });
  expect(fixture.readUpload).not.toHaveBeenCalled();
  fixture.advance(1000);
  fixture.storeMedia.mockImplementationOnce(async () => {
    fixture.advance(86400000);
    return "stored";
  });
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).rejects.toMatchObject({ details: { reservationExpired: true } });
  expect(fixture.created).toEqual([]);
  fixture.seed({ result: { status: "duplicate", mediaId: "canonical", digest: "digest" } });
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).resolves.toEqual({ status: "duplicate", mediaId: "canonical", digest: "digest" });
});

test.each([false, true])("an existing digest reuses its identity without overwriting metadata (conflict: %s)", async (conflict) => {
  const fixture = finalizationFixture();
  const metadata = { ...fixture.metadata, alt: conflict ? "Outra praia" : fixture.metadata.alt };
  fixture.canonical.set("digest", { id: "canonical", metadata });
  expect(await fixture.finalization.finalize("owner", "operation", finalizeInput)).toEqual({ status: conflict ? "conflict" : "duplicate", mediaId: "canonical", digest: "digest" });
  expect(fixture.created).toEqual([]);
  expect(fixture.canonical.get("digest")?.metadata).toEqual(metadata);
});

test.each(["readUpload", "sanitize", "storeMedia"] as const)("a %s failure can be retried with the same operation", async (effect) => {
  const fixture = finalizationFixture();
  const failure = new Error("Unavailable");
  fixture[effect].mockRejectedValueOnce(failure);
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).rejects.toBe(failure);
  expect(fixture.created).toEqual([]);
  if (effect === "readUpload") expect(fixture.sanitize).not.toHaveBeenCalled();
  if (effect !== "storeMedia") expect(fixture.storeMedia).not.toHaveBeenCalled();
  await expect(fixture.finalization.finalize("owner", "other", finalizeInput)).rejects.toMatchObject({ code: "duplicate" });
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).resolves.toHaveProperty("status", "created");
  expect(fixture.created).toHaveLength(1);
});

test("a failed final commit preserves the started reservation for retry", async () => {
  const fixture = finalizationFixture();
  const transact = fixture.transact.getMockImplementation()!;
  fixture.transact.mockImplementationOnce(transact).mockRejectedValueOnce(new Error("Commit unavailable"));
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).rejects.toThrow("Commit unavailable");
  expect(fixture.created).toEqual([]);
  fixture.advance(600000);
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).resolves.toHaveProperty("status", "created");
  expect(fixture.created).toHaveLength(1);
});

test("invalid input and failed reservation reads do not start upload I/O", async () => {
  const fixture = finalizationFixture();
  await expect(fixture.finalization.finalize("owner", "operation", { ...finalizeInput, reservationId: "invalid" })).rejects.toMatchObject({ code: "validationFailed" });
  expect(fixture.transact).not.toHaveBeenCalled();
  fixture.transact.mockRejectedValueOnce(new Error("Read unavailable"));
  await expect(fixture.finalization.finalize("owner", "operation", finalizeInput)).rejects.toThrow("Read unavailable");
  expect(fixture.readUpload).not.toHaveBeenCalled();
});
