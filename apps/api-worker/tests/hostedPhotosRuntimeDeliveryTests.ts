import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { createHostedClassifiedsPhotos } from "../hostedPhotos";
import sharp from "sharp";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore, createClassifiedsPhotos } from "../classifiedsPhotos";
import { runtime, now, bytes, record, provider, restartRuntime, classifiedsDatabase } from "./hostedPhotosRuntimeHarness";
import { hostedPhotoVariants } from "../hostedPhotoVariants";
import { photoByteLimit, photoDeliveryByteLimit } from "@tudomacae/classifieds-photos";
// Cloudflare Images rejects variant names containing `-` or `_` (5400 "Variant name ... is not allowed").
test("variant ids are names Cloudflare Images accepts", () => {
  for (const { id } of hostedPhotoVariants) expect(id).toMatch(/^[a-z0-9]+$/);
});
test("persists a private Hosted ID before bytes and reconciles lost upload response after a D1 restart", async () => {
  const p = provider();
  p.loseResponse();
  await expect((await p.objects()).create(record, bytes)).rejects.toMatchObject({ code: "unavailable" });
  await restartRuntime();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  expect(p.allocations()).toBe(1);
  expect(p.sends()).toBe(1);
  expect(await objects.read({ ...record, generation })).toEqual({ bytes, mimeType: "image/png" });
  expect(await objects.head({ ...record, generation })).toBe(true);
});

test("native delivery reads the reserved private variant without downloading originals or writing D1", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  const reads = p.originalReads();
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const version = await persistence.transferVersion();
  expect(await objects.deliver!({ ...record, generation }, { width: 3840, format: "webp" })).toEqual({ bytes, mimeType: "image/webp", delivered: true });
  expect(p.deliveries).toEqual([{ url: expect.stringContaining(`/w1920?token=`), accept: "image/webp" }]);
  expect(p.originalReads()).toBe(reads);
  expect(await persistence.transferVersion()).toBe(version);
  p.items.get(generation)!.metadata.requireSignedURLs = false;
  await expect(objects.deliver!({ ...record, generation }, { width: 128, format: "webp" })).rejects.toMatchObject({ code: "unavailable" });
  expect(p.deliveries).toHaveLength(1);
});

test("native delivery accepts a variant larger than the upload limit", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  const variant = new Uint8Array(photoByteLimit + 1);
  p.reply(() => new Response(variant, { headers: { "content-type": "image/jpeg" } }));
  expect(await objects.deliver!({ ...record, generation }, { width: 1920, format: "jpeg" })).toEqual({ bytes: variant, mimeType: "image/jpeg", delivered: true });
});

test("a delivery probe checks the signed variant without reading past its first chunk", async () => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  let pulls = 0;
  let cancelled = false;
  p.reply(() => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(1024));
    },
    cancel() {
      cancelled = true;
    },
  }), { headers: { "content-type": "image/avif" } }));
  expect(await objects.deliver!({ ...record, generation }, { width: 1920, format: "avif" }, true)).toEqual({ bytes: new Uint8Array(), mimeType: "image/avif", delivered: true });
  expect(p.deliveries).toEqual([{ url: expect.stringContaining(`/w1920?token=`), accept: "image/avif" }]);
  expect(pulls).toBeLessThanOrEqual(2);
  expect(cancelled).toBe(true);
});

test.each(["declared oversized", "empty", "html", "failed"])("a delivery probe fails closed on %s provider responses", async (failure) => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  p.reply(() => new Response(failure === "empty" ? new Uint8Array() : bytes, {
    status: failure === "failed" ? 403 : 200,
    headers: { "content-type": failure === "html" ? "text/html" : "image/webp", ...(failure === "declared oversized" ? { "content-length": String(photoDeliveryByteLimit + 1) } : {}) },
  }));
  await expect(objects.deliver!({ ...record, generation }, { width: 128, format: "webp" }, true)).rejects.toMatchObject({ code: "unavailable" });
});

test.each(["oversized", "empty", "html", "failed"])("native delivery fails closed on %s provider responses", async (failure) => {
  const p = provider();
  const objects = await p.objects();
  const generation = await objects.create(record, bytes);
  p.reply(() => new Response(failure === "oversized" ? new Uint8Array(photoDeliveryByteLimit + 1) : failure === "empty" ? new Uint8Array() : bytes, {
    status: failure === "failed" ? 403 : 200, headers: { "content-type": failure === "html" ? "text/html" : "image/webp" },
  }));
  await expect(objects.deliver!({ ...record, generation }, { width: 128, format: "webp" })).rejects.toMatchObject({ code: "unavailable" });
  expect(p.deliveries).toHaveLength(1);
});

test("native delivery rechecks publication after provider fetch and never serves a withdrawn image", async () => {
  const database = await classifiedsDatabase();
  const persistence = createClassifiedsPersistence({ database });
  await persistence.transact(null, async (tx) => {
    await tx.read("ad", "ad");
    tx.put({ kind: "ad", id: "ad", body: { userId: "owner", publicationState: "published", status: "active", createdAt: now, images: [] } });
    return null;
  });
  const path = `ad-images/ad/pending/${record.operationId}.png`;
  const p = provider(path);
  const photos = createClassifiedsPhotos({ database, objects: await p.objects(), images: (await runtime.getBindings<{ IMAGES: ImagesBinding }>()).IMAGES,
    now: () => now, purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: () => {} });
  const actor = { uid: "owner", admin: false };
  const png = new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer());
  const linked = await photos.upload(actor, { ownerKind: "ad", ownerId: "ad", operationId: record.operationId, expectedRevision: 1, mimeType: "image/png", bytes: png });
  const delivery = { width: 128, format: "webp" as const };
  expect(await photos.readAd("ad", linked.id, undefined, false, delivery)).toMatchObject({ delivered: true });
  p.beforeDelivery(async () => {
    await persistence.transact(null, async (tx) => {
      const ad = (await tx.read("ad", "ad"))!;
      tx.put({ ...ad, body: { ...ad.body, publicationState: "pending" } });
      return null;
    });
  });
  expect(await photos.readAd("ad", linked.id, undefined, false, delivery)).toBeNull();
  const count = p.deliveries.length;
  expect(await photos.readAd("ad", linked.id, undefined, false, delivery)).toBeNull();
  expect(p.deliveries).toHaveLength(count);
});

test.each(["ad", "profile"] as const)("Hosted factory sends sanitized JPEG, PNG and WebP for %s and reconciles a lost response", async (ownerKind) => {
  let processing = 0;
  for (const format of ["jpeg", "png", "webp"] as const) {
    const ownerId = `${ownerKind}-${format}`;
    const input = { ownerKind, ownerId, operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: `image/${format}` as "image/jpeg" | "image/png" | "image/webp",
      bytes: new Uint8Array(await sharp({ create: { width: 4, height: 3, channels: 3, background: "white" } }).withExif({ IFD0: { Copyright: "Private source metadata" } })[format]().toBuffer()) };
    const path = `${ownerKind === "ad" ? `ad-images/${ownerId}/pending/` : `profile-photos/${ownerId}/`}${input.operationId}.jpg`;
    const p = provider(path);
    const database = await classifiedsDatabase();
    await createClassifiedsPersistence({ database }).transact(null, async (tx) => {
      await tx.read(ownerKind, ownerId);
      tx.put({ kind: ownerKind, id: ownerId, body: { userId: "owner", title: "Conteúdo", createdAt: now, ...(ownerKind === "ad" ? { images: [], status: "active", publicationState: "pending" } : {}) } });
      return null;
    });
    async function photos() {
      const { IMAGES: source } = await runtime.getBindings<{ IMAGES: Pick<ImagesBinding, "info" | "input"> }>();
      return createHostedClassifiedsPhotos({ database: await classifiedsDatabase(), images: {
        info: async (stream) => {
          processing++;
          return source.info(stream);
        }, input: stream => source.input(stream), hosted: p.images,
      }, send: p.send, now: () => now, purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: () => {} });
    }
    const actor = { uid: "owner", admin: false };
    const before = processing;
    if (ownerKind === "ad" && format === "jpeg") {
      p.loseResponse();
      await expect((await photos()).upload(actor, input)).rejects.toMatchObject({ code: "unavailable" });
      await restartRuntime();
    }
    const photo = await (await photos()).upload(actor, input);
    expect(photo).toMatchObject({ path, mimeType: "image/jpeg", status: "linked", processingAttempts: 1,
      input: { mimeType: input.mimeType, digest: createHash("sha256").update(input.bytes).digest("hex") } });
    const stored = p.items.get(photo.generation!)!;
    expect(stored.metadata.requireSignedURLs).toBe(true);
    expect(photo.digest).toBe(createHash("sha256").update(stored.bytes!).digest("hex"));
    expect(photo.size).toBe(stored.bytes!.byteLength);
    const metadata = await sharp(stored.bytes!).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 4, height: 3 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(await (await photos()).upload(actor, input)).toEqual(photo);
    expect(processing - before).toBe(1);
    expect(p.allocations()).toBe(1);
    expect(p.sends()).toBe(1);
  }
  expect((await createD1PhotoStore(await classifiedsDatabase(), createClassifiedsPersistence({ database: await classifiedsDatabase() })).transact(tx => tx.quota("owner"))).uploads).toHaveLength(3);
});
