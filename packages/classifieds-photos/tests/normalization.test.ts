import { expect, test } from "vitest";
import { createPhotoLifecycle } from "../index";
import { fixture, actor, upload } from "./fixture";

const webp = new Uint8Array([...new TextEncoder().encode("RIFF1234WEBP"), 1]);
function normalized() {
  const f = fixture();
  f.owner("profile");
  let paid = 0;
  f.dependencies.normalize = async () => {
    paid++;
    return { bytes: webp, mimeType: "image/webp", sourceMimeType: "image/png", width: 2, height: 2 };
  };
  f.dependencies.decode = async () => {
    throw new Error("Separate decoder reached");
  };
  return { ...f, paid: () => paid };
}

test("normalization stores WebP identity while replay compares the original input", async () => {
  const f = normalized();
  const input = upload("profile");
  const photo = await f.lifecycle.upload(actor, input);
  expect(photo).toMatchObject({ mimeType: "image/webp", size: webp.byteLength, digest: await f.dependencies.digest(webp), input: { digest: await f.dependencies.digest(input.bytes), size: input.bytes.byteLength, mimeType: "image/png" } });
  expect(photo.path.endsWith(".webp")).toBe(true);
  expect(f.bytes.get(photo.path)?.bytes).toEqual(webp);
  expect(await f.lifecycle.upload(actor, input)).toEqual(photo);
  await expect(f.lifecycle.upload(actor, { ...input, bytes: new Uint8Array([...input.bytes, 1]) })).rejects.toMatchObject({ code: "conflict" });
  expect(f.paid()).toBe(1);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
});

test("lost writes reconcile normalized bytes without another transformation", async () => {
  const f = normalized();
  const create = f.dependencies.objects.create;
  f.dependencies.objects.create = async (record, bytes) => {
    await create(record, bytes);
    throw new Error("Lost response");
  };
  const input = upload("profile");
  await expect(f.lifecycle.upload(actor, input)).rejects.toThrow("Lost response");
  f.dependencies.objects.create = create;
  expect(await createPhotoLifecycle(f.dependencies).upload(actor, input)).toMatchObject({ status: "linked", processingAttempts: 1 });
  expect(f.paid()).toBe(1);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
});

test("a normalized receipt cannot be replaced by different processing bytes", async () => {
  const f = normalized();
  const input = upload("profile");
  const photo = await f.lifecycle.reserve(actor, input);
  f.dependencies.normalize = async () => ({ bytes: new Uint8Array([...webp, 2]), mimeType: "image/webp", sourceMimeType: "image/png", width: 2, height: 2 });
  await expect(f.lifecycle.upload(actor, input)).rejects.toMatchObject({ code: "conflict" });
  expect(f.records.get(photo.path)?.digest).toBe(photo.digest);
  expect(f.records.get(photo.path)?.processingAttempts).toBe(2);
  expect(f.bytes.size).toBe(0);
});

test("missing normalized bytes consume at most three durable processing attempts", async () => {
  const f = normalized();
  const input = upload("profile");
  f.dependencies.objects.create = async () => {
    throw new Error("No stored bytes");
  };
  for (let i = 0; i < 3; i++) await expect(createPhotoLifecycle(f.dependencies).upload(actor, input)).rejects.toThrow("No stored bytes");
  await expect(f.lifecycle.upload(actor, input)).rejects.toMatchObject({ code: "retired" });
  expect(f.paid()).toBe(3);
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
});

test("normalization failures retain attempts but never attach an owner slot", async () => {
  const f = normalized();
  const input = upload("profile");
  let paid = 0;
  f.dependencies.normalize = async () => {
    paid++;
    throw new Error("Processing unavailable");
  };
  for (let i = 0; i < 3; i++) await expect(createPhotoLifecycle(f.dependencies).upload(actor, input)).rejects.toThrow("Processing unavailable");
  await expect(f.lifecycle.upload(actor, input)).rejects.toMatchObject({ code: "retired" });
  expect(paid).toBe(3);
  expect(f.owners.get("profile:profile")).toMatchObject({ revision: 1, reservations: [] });
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
});

test("legacy reservations retain their immutable raw identity when the factory changes", async () => {
  const f = fixture();
  f.owner("profile");
  const input = upload("profile");
  const raw = await f.lifecycle.reserve(actor, input);
  f.dependencies.normalize = async () => {
    throw new Error("Legacy identity changed");
  };
  const photo = await createPhotoLifecycle(f.dependencies).upload(actor, input);
  expect(photo).toMatchObject({ path: raw.path, mimeType: "image/png", processingAttempts: 1, digest: raw.digest });
  expect(photo.input).toBeUndefined();
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
  expect(f.bytes.get(photo.path)?.bytes).toEqual(input.bytes);
});

test("admission rejection precedes normalization and failed processing leaves the owner untouched", async () => {
  const f = normalized();
  const input = upload("profile");
  f.quotas.set(actor.uid, { uploads: Array.from({ length: 20 }, () => f.dependencies.now()) });
  await expect(f.lifecycle.upload(actor, input)).rejects.toMatchObject({ code: "rate_limit" });
  expect(f.paid()).toBe(0);
  f.advance(300_000);
  f.dependencies.normalize = async () => ({ bytes: new Uint8Array(), mimeType: "image/webp", sourceMimeType: "image/png", width: 2, height: 2 });
  await expect(f.lifecycle.upload(actor, input)).rejects.toMatchObject({ code: "invalid" });
  expect(f.owners.get("profile:profile")).toMatchObject({ revision: 1, reservations: [] });
  expect(f.bytes.size).toBe(0);
});

test.each([false, true])("WebP intents keep their format and digest after JPEG policy changes (stored: %s)", async (stored) => {
  const f = normalized();
  const input = upload("profile");
  const original = await f.lifecycle.reserve(actor, input);
  if (stored) await f.dependencies.objects.create(original, webp);
  f.dependencies.normalizedMimeType = "image/jpeg";
  f.dependencies.normalize = async (_bytes, _maxPixels, format) => {
    expect(format).toBe("image/webp");
    return { bytes: webp, mimeType: "image/webp", sourceMimeType: "image/png", width: 2, height: 2 };
  };
  const photo = await createPhotoLifecycle(f.dependencies).upload(actor, input);
  expect(photo).toMatchObject({ path: original.path, mimeType: "image/webp", digest: original.digest, status: "linked" });
  expect(f.quotas.get(actor.uid)?.uploads).toHaveLength(1);
});

test("JPEG policy reserves and stores JPEG identity", async () => {
  const f = normalized();
  const jpeg = new Uint8Array([255, 216, 255, 224]);
  f.dependencies.normalizedMimeType = "image/jpeg";
  f.dependencies.normalize = async (_bytes, _maxPixels, format) => {
    expect(format).toBe("image/jpeg");
    return { bytes: jpeg, mimeType: "image/jpeg", sourceMimeType: "image/png", width: 2, height: 2 };
  };
  const photo = await createPhotoLifecycle(f.dependencies).upload(actor, upload("profile"));
  expect(photo.path.endsWith(".jpg")).toBe(true);
  expect(photo.mimeType).toBe("image/jpeg");
  expect(f.bytes.get(photo.path)?.bytes).toEqual(jpeg);
});
