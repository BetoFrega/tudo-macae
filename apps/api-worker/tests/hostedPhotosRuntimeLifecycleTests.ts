import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { createHostedClassifiedsPhotos } from "../hostedPhotos";
import sharp from "sharp";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore, createClassifiedsPhotos, createClassifiedsPhotoSanitizer } from "../classifiedsPhotos";
import { createPhotoLifecycle, photoLeaseMs } from "@tudomacae/classifieds-photos";
import { runtime, now, bytes, record, provider, restartRuntime, advanceClock, classifiedsDatabase } from "./hostedPhotosRuntimeHarness";
test("Hosted sanitizer factory preserves an earlier RAW intent across lost response, restart and cleanup", async () => {
  const database = await classifiedsDatabase();
  const persistence = createClassifiedsPersistence({ database });
  await persistence.transact(null, async (tx) => {
    await tx.read("profile", "legacy");
    tx.put({ kind: "profile", id: "legacy", body: { userId: "owner", title: "Perfil", createdAt: now } });
    return null;
  });
  const input = { ownerKind: "profile" as const, ownerId: "legacy", operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png" as const,
    bytes: new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer()) };
  const path = `profile-photos/legacy/${input.operationId}.png`;
  const p = provider(path);
  const { IMAGES: images } = await runtime.getBindings<{ IMAGES: Pick<ImagesBinding, "info" | "input"> }>();
  const purge = { prepare: async () => {}, verify: async () => ({ success: true as const }) };
  const actor = { uid: "owner", admin: false };
  p.loseResponse();
  const earlier = createClassifiedsPhotos({ database, images, objects: await p.objects(), now: () => now, purge, observe: () => {} });
  await expect(earlier.upload(actor, input)).rejects.toMatchObject({ code: "unavailable" });
  await restartRuntime();
  const resumedDatabase = await classifiedsDatabase();
  const { IMAGES: resumedImages } = await runtime.getBindings<{ IMAGES: Pick<ImagesBinding, "info" | "input"> }>();
  const current = createHostedClassifiedsPhotos({ database: resumedDatabase, images: {
    info: async () => { throw new Error("Legacy processing repeated"); }, input: stream => resumedImages.input(stream), hosted: p.images,
  }, send: p.send, now: () => now, purge, observe: () => {} });
  const photo = await current.upload(actor, input);
  expect(photo).toMatchObject({ status: "linked", path, mimeType: "image/png", processingAttempts: 1, digest: createHash("sha256").update(input.bytes).digest("hex") });
  expect(photo.input).toBeUndefined();
  expect(p.allocations()).toBe(1);
  expect(p.sends()).toBe(1);
  expect(await current.read(path, actor)).toEqual({ bytes: input.bytes, mimeType: "image/png" });
  await current.remove(actor, path);
  advanceClock(2 * photoLeaseMs);
  expect(await current.sweep()).toMatchObject({ completed: 1, pending: 0 });
  expect(p.items.size).toBe(0);
});

test("the D1 lifecycle links Hosted bytes privately and completes queued withdrawal", async () => {
  const database = await classifiedsDatabase();
  const persistence = createClassifiedsPersistence({ database });
  await persistence.transact(null, async (tx) => {
    await tx.read("ad", "ad");
    tx.put({ kind: "ad", id: "ad", body: { userId: "owner", publicationState: "pending", status: "active", createdAt: now, images: [] } });
    return null;
  });
  const p = provider(`ad-images/ad/pending/${record.operationId}.png`);
  const events: unknown[] = [];
  const lifecycle = createPhotoLifecycle({
    store: createD1PhotoStore(database, persistence), objects: await p.objects(),
    decode: async () => ({ mimeType: "image/png", width: 1, height: 1 }),
    digest: async value => createHash("sha256").update(value).digest("hex"),
    now: () => now, newId: () => crypto.randomUUID(),
    purge: { prepare: async () => {}, verify: async () => ({ success: true, failures: [] }) },
    observe: event => events.push(event),
  });
  const owner = { uid: "owner", admin: false };
  const linked = await lifecycle.upload(owner, { ownerKind: "ad", ownerId: "ad", operationId: record.operationId, expectedRevision: 1, mimeType: "image/png", bytes });
  expect(linked.status).toBe("linked");
  expect(JSON.stringify(linked)).not.toContain("uploadURL");
  expect(await lifecycle.read(linked.path)).toBeNull();
  expect(await lifecycle.read(linked.path, owner)).toEqual({ bytes, mimeType: "image/png" });
  await expect(lifecycle.read(linked.path, { uid: "other", admin: false })).rejects.toMatchObject({ code: "forbidden" });
  await lifecycle.remove(owner, linked.path);
  expect(await lifecycle.read(linked.path, owner)).toBeNull();
  expect(await lifecycle.sweep()).toMatchObject({ completed: 1, pending: 0 });
  expect(p.items.size).toBe(0);
  expect(events).toContainEqual({ operation: "cleanup", outcome: "success", operationId: record.operationId });
});
test("concurrent upload cannot allocate another ID and retirement waits for the active writer", async () => {
  const p = provider();
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  p.beforeSend(async () => {
    entered();
    await wait;
  });
  const objects = await p.objects();
  const uploading = objects.create(record, bytes);
  const rejected = expect(uploading).rejects.toMatchObject({ code: "retired" });
  await ready;
  try {
    await expect(objects.create(record, bytes)).rejects.toMatchObject({ code: "conflict" });
    await expect(objects.retire(record)).rejects.toMatchObject({ code: "conflict" });
    expect(p.allocations()).toBe(1);
    expect(p.sends()).toBe(1);
  }
  finally { release(); }
  await rejected;
  await objects.retire(record);
  expect(p.items.size).toBe(0);
  await expect(objects.create(record, bytes)).rejects.toMatchObject({ code: "retired" });
});
test("lost responses hide upload credentials and keep withdrawal pending through the uncertainty window", async () => {
  const p = provider();
  p.loseResponse();
  const objects = await p.objects();
  await expect(objects.create(record, bytes)).rejects.toMatchObject({ code: "unavailable", message: "A operação da foto exige reconciliação. Tente novamente." });
  await expect(objects.retire(record)).rejects.toMatchObject({ code: "conflict" });
  expect(p.items.size).toBe(1);
  advanceClock(2 * photoLeaseMs + 1);
  await objects.retire(record);
  expect(p.items.size).toBe(0);
});
test("invalid bytes consume no provider reservation and reconciliation rejects public or mismatched bytes", async () => {
  const p = provider();
  const objects = await p.objects();
  await expect(objects.create(record, new Uint8Array([1]))).rejects.toMatchObject({ code: "invalid" });
  expect(p.allocations()).toBe(0);
  const generation = await objects.create(record, bytes);
  const item = p.items.get(generation)!;
  item.metadata.requireSignedURLs = false;
  await expect(objects.head(record)).rejects.toMatchObject({ code: "unavailable" });
  item.metadata.requireSignedURLs = true;
  item.bytes = new Uint8Array([1, 2, 3, 4]);
  await expect(objects.read(record)).rejects.toMatchObject({ code: "unavailable" });
  expect(p.allocations()).toBe(1);
  expect(p.sends()).toBe(1);
});
test("conflicting content never creates another provider ID and retirement prevents resurrection", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  await expect(objects.create({ ...record, operationId: crypto.randomUUID() }, bytes)).rejects.toMatchObject({ code: "conflict" });
  const linked = { ...record, generation };
  await objects.retire(linked);
  expect(await objects.read(linked)).toBeNull();
  await expect(objects.create(record, bytes)).rejects.toMatchObject({ code: "retired" });
  expect(p.allocations()).toBe(1);
  expect(p.items.size).toBe(0);
});
test("lookup is read-only and expiry never allocates a replacement ID for the same operation", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const version = await persistence.transferVersion();
  await objects.head({ ...record, generation });
  await objects.read({ ...record, generation });
  expect(await persistence.transferVersion()).toBe(version);
  const item = p.items.get(generation)!;
  item.metadata.draft = true;
  item.bytes = undefined;
  advanceClock(photoLeaseMs + 1);
  await expect(objects.create(record, bytes)).rejects.toMatchObject({ code: "retired" });
  expect(p.allocations()).toBe(1);
  expect(p.sends()).toBe(1);
});

test("sanitized uploads explicitly flatten animation before storing JPEG", async () => {
  const { IMAGES: source } = await runtime.getBindings<{ IMAGES: Pick<ImagesBinding, "info" | "input"> }>();
  let outputCalls = 0;
  const sanitize = createClassifiedsPhotoSanitizer({ info: stream => source.info(stream), input: (stream) => {
    const input = source.input(stream);
    const transform = input.transform.bind(input);
    input.transform = (options) => {
      const transformed = transform(options);
      const output = transformed.output.bind(transformed);
      transformed.output = (options) => {
        expect(options).toMatchObject({ anim: false, format: "image/jpeg", background: "#ffffff" });
        outputCalls++;
        return output(options);
      };
      return transformed;
    };
    return input;
  } });
  const gif = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
  expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
  const result = await sanitize(new Uint8Array(gif));
  expect(result.mimeType).toBe("image/jpeg");
  expect((await sharp(result.bytes, { animated: true }).metadata()).pages ?? 1).toBe(1);
  expect(outputCalls).toBe(1);
});
