import { expect, test } from "vitest";
import sharp from "sharp";
import { z } from "zod";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore } from "../classifiedsPhotos";
import { photoLeaseMs } from "@tudomacae/classifieds-photos";
import { now, runtime, options, gates, call, startRuntime, upload, photo, png, classifiedsDatabase } from "./photosRuntimeHarness";
test("scheduled entrypoint retires bounded expired reservations across events while qualification off preserves them", async () => {
  const paths: string[] = [];
  for (let index = 0; index < 26; index++) {
    const id = `expired-${index}`;
    expect((await call({ action: "save", records: [{ kind: "ad", id, body: { userId: "owner", status: "active", publicationState: "pending", createdAt: now, images: [] } }] })).error).toBeUndefined();
    const request = { ...upload(), ownerId: id };
    const admissionTime = index < 20 ? now - 300_000 : now;
    if (index === 0) expect((await call({ action: "upload", request, now: admissionTime, fault: "bytes" })).error).toBeDefined();
    const reserved = await call({ action: "reserve", request, now: admissionTime });
    paths.push(z.object({ path: z.string() }).parse(reserved.value).path);
  }
  const live = z.object({ path: z.string() }).parse((await call({ action: "reserve", now: now + photoLeaseMs, request: upload() })).value);
  const scheduledTime = new Date(now + photoLeaseMs + 1);
  const status = async (path: string) => {
    const database = await classifiedsDatabase();
    const store = createD1PhotoStore(database, createClassifiedsPersistence({ database }));
    return (await store.transact(tx => tx.photo(path)))?.status;
  };
  const env = options.workers![0]!.config.env!;
  for (const value of ["production", "off", "unavailable"]) {
    Object.assign(env, { QUALIFICATION: { type: "json", value } });
    await runtime.setOptions(options);
    expect(await (await runtime.getWorker()).scheduled({ scheduledTime })).toMatchObject({ outcome: "ok" });
    expect(await Promise.all(paths.map(status))).toEqual(Array.from({ length: 26 }, () => "reserved"));
  }
  Object.assign(env, { QUALIFICATION: { type: "json", value: "d1" } });
  await runtime.setOptions(options);
  expect(await (await runtime.getWorker()).scheduled({ scheduledTime })).toMatchObject({ outcome: "ok" });
  expect((await Promise.all(paths.map(status))).filter(value => value === "retired")).toHaveLength(25);
  expect(await status(live.path)).toBe("reserved");
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect(await (await runtime.getWorker()).scheduled({ scheduledTime })).toMatchObject({ outcome: "ok" });
  expect(await (await runtime.getR2Bucket("PHOTOS")).head(paths[0]!)).toMatchObject({ size: 0, customMetadata: { classifiedsRetired: "1" } });
  const finalStore = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  for (let index = 0; index < 26; index++) expect((await finalStore.read("ad", `expired-${index}`))?.body.pendingImageUploadReservations).toEqual([]);
  expect((await finalStore.read("ad", "ad"))?.body.pendingImageUploadReservations).toHaveLength(1);
}, 60_000);
test("R2 response loss resumes across restart; pending bytes remain private", async () => {
  const request = upload();
  expect((await call({ action: "upload", request, fault: "bytes" })).error).toBeDefined();
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  const linked = photo.parse((await call({ action: "upload", request })).value);
  expect((await call({ action: "upload", request })).value).toMatchObject(linked);
  expect((await call({ action: "read", path: linked.path })).value).toBeNull();
  expect((await call({ action: "read", path: linked.path, private: true })).value).toMatchObject({ bytes: request.bytes });
});
test("two racing finalizers share one immutable object and one metadata confirmation", async () => {
  const request = upload();
  const results = await Promise.all([call({ action: "upload", request }), call({ action: "upload", request })]);
  expect(results.filter(result => !result.error).length).toBeGreaterThanOrEqual(1);
  for (const result of results.filter(result => result.error)) expect(result.code).toBe("conflict");
  const confirmed = (await call({ action: "upload", request })).value;
  for (const result of results.filter(result => !result.error)) expect(result.value).toEqual(confirmed);
  expect((await (await runtime.getR2Bucket("PHOTOS")).list()).objects).toHaveLength(1);
});
test("one operation ID cannot acquire another MIME key, including after retirement and restart", async () => {
  const request = upload();
  const first = photo.parse((await call({ action: "upload", request })).value);
  const jpeg = [...await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).jpeg().toBuffer()];
  const changed = { ...request, expectedRevision: 3, mimeType: "image/jpeg", bytes: jpeg };
  expect((await call({ action: "upload", request: changed })).code).toBe("conflict");
  await call({ action: "remove", path: first.path });
  await call({ action: "sweep" });
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect((await call({ action: "upload", request: { ...changed, expectedRevision: 4 } })).code).toBe("conflict");
  expect(await (await runtime.getR2Bucket("PHOTOS")).head(first.path.replace(/png$/, "jpg"))).toBeNull();
});
test("native Images rejection consumes admission without storing image objects", async () => {
  const request = upload();
  const bad = await call({ action: "upload", request: { ...request, bytes: [137, 80, 78, 71, 13, 10, 26, 10] } });
  expect(bad.error).toBeDefined();
  const truncated = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer()).subarray(0, 70);
  expect(await sharp(truncated).metadata()).toMatchObject({ width: 64, height: 64 });
  expect((await call({ action: "upload", request: { ...upload(), bytes: [...truncated] } })).error).toBeDefined();
  const large = [...await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "white" } }).png().toBuffer()];
  expect((await call({ action: "upload", request: { ...upload(), bytes: large } })).code).toBe("invalid");
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  expect((await store.read("ad", "ad"))?.body.images).toEqual([]);
  expect((await store.read("retirement", `ad-images/ad/pending/${request.operationId}.png`, "classifieds_photos"))?.body).toMatchObject({ status: "reserved", processingAttempts: 1 });
  expect((await call({ action: "read", path: `ad-images/ad/pending/${request.operationId}.png` })).value).toBeNull();
  expect((await (await runtime.getR2Bucket("PHOTOS")).list()).objects).toHaveLength(0);
  expect((await call({ action: "upload", request: { ...upload("profile"), bytes: large } })).code).toBe("invalid");
});
test("publication requires current R2 bytes with the confirmed generation", async () => {
  const result = photo.parse((await call({ action: "upload", request: upload() })).value);
  expect((await call({ action: "publication" })).value).toMatchObject({ revision: 3 });
  const bucket = await runtime.getR2Bucket("PHOTOS");
  await bucket.delete(result.path);
  expect((await call({ action: "publication" })).code).toBe("unavailable");
  await bucket.put(result.path, new Uint8Array(png), { httpMetadata: { contentType: "image/png" } });
  expect((await call({ action: "publication" })).code).toBe("unavailable");
});

test("publication starting during the R2 write cannot confirm or remove an Ad photo", async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set("publish", { entered, wait });
  const request = upload();
  const pending = call({ action: "upload", request, gate: "publish" });
  await ready;
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  await store.transact(null, async (tx) => {
    const ad = (await tx.read("ad", "ad"))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "publishing" } });
    return null;
  });
  release();
  expect((await pending).code).toBe("conflict");
  const path = `ad-images/ad/pending/${request.operationId}.png`;
  expect((await call({ action: "remove", path })).code).toBe("conflict");
  expect((await store.read("retirement", path, "classifieds_photos"))?.body.status).toBe("reserved");
  expect((await store.read("ad", "ad"))?.body.images).toEqual([expect.objectContaining({ path, pending: true })]);
  expect((await call({ action: "read", path })).value).toBeNull();
});
