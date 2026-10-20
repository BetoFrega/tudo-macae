import { expect, test } from "vitest";
import { z } from "zod";
import sharp from "sharp";
import { createClassifiedsPersistence } from "../classifieds";
import { photoLeaseMs, photoRecordSchema, type PhotoRecord } from "@tudomacae/classifieds-photos";
import { now, runtime, gates, call, startRuntime, readRecord, readRecords, upload, photo, capability, account, classifiedsDatabase } from "./photosRuntimeHarness";
test("photo receipt replay preserves a newer staged upload and rechecks current ownership", async () => {
  const input = { id: "ad", operationId: crypto.randomUUID(), images: [], observedImages: [] };
  expect((await capability("publications.photos", input)).value).toEqual([]);
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const request = { ...upload(), pendingPublication: true, expectedRevision: Number((await store.read("ad", "ad"))!.body.revision) };
  const staged = photoRecordSchema.parse((await call({ action: "upload", request })).value);
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  const resumed = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  expect((await capability("publications.photos", input)).value).toEqual([]);
  expect((await resumed.read("ad", "ad"))!.body.pendingImageUploadReservations).toHaveLength(1);
  expect((await resumed.page({ kind: "adCleanup" })).items).toHaveLength(0);
  expect((await capability("publications.photos", { ...input, observedImages: [{ id: staged.id, title: "", description: "", order: 0 }] })).error).toBe("IdempotencyConflict");
  await resumed.transact(null, async (tx) => {
    const profile = (await tx.read("profile", "profile"))!;
    tx.put({ ...profile, body: { ...profile.body, userId: "another-owner" } });
    return null;
  });
  expect((await capability("publications.photos", input)).error).toBe("AdOperationError");
  expect((await resumed.read("ad", "ad"))!.body.pendingImageUploadReservations).toHaveLength(1);
  await resumed.transact(null, async (tx) => {
    const profile = (await tx.read("profile", "profile"))!;
    tx.put({ ...profile, body: { ...profile.body, userId: "owner" } });
    return null;
  });
  expect((await capability("publications.photos", { ...input, operationId: crypto.randomUUID() })).error).toBeUndefined();
  expect((await resumed.read("ad", "ad"))!.body.pendingImageUploadReservations).toEqual([]);
  expect((await capability("publications.delete", { id: "ad" })).error).toBeUndefined();
  expect((await call({ action: "sweep" })).error).toBeUndefined();
  expect((await resumed.read("retirement", staged.path, "classifieds_photos"))!.body.status).toBe("retired");
});

test("a discarded staged upload cannot confirm after its in-flight producer resumes", async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set("discard", { entered, wait });
  const request = { ...upload(), pendingPublication: true };
  const pending = call({ action: "upload", request, gate: "discard" });
  await ready;
  try {
    expect((await capability("publications.photos", { id: "ad", images: [], observedImages: [] })).error).toBeUndefined();
  }
  finally {
    release();
  }
  expect((await pending).code).toBe("conflict");
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  expect((await store.read("ad", "ad"))!.body.pendingImageUploadReservations).toEqual([]);
  expect((await store.read("ad", "ad"))!.body.images).toEqual([]);
  expect((await store.page({ kind: "adCleanup" })).items).toHaveLength(1);
  expect((await call({ action: "sweep", now: now + photoLeaseMs })).error).toBeUndefined();
  const path = `ad-images/ad/pending/${request.operationId}.png`;
  expect((await store.read("retirement", path, "classifieds_photos"))!.body.status).toBe("retired");
});

test("all sixteen staged reservations detach within one bounded commit and cleanup resumes after restart", async () => {
  const store = { read: readRecord, page: readRecords };
  const original: PhotoRecord[] = [];
  for (let index = 0; index < 3; index++) {
    const expectedRevision = Number((await store.read("ad", "ad"))!.body.revision ?? 1);
    original.push(photoRecordSchema.parse((await call({ action: "upload", request: { ...upload(), expectedRevision } })).value));
  }
  const staged: PhotoRecord[] = [];
  for (let index = 0; index < 16; index++) {
    const expectedRevision = Number((await store.read("ad", "ad"))!.body.revision ?? 1);
    staged.push(photoRecordSchema.parse((await call({ action: "upload", request: { ...upload(), pendingPublication: true, expectedRevision } })).value));
  }
  const selected = staged.slice(0, 3).map((item, order) => ({ id: item.id, title: item.title, description: item.description, order }));
  const observed = original.map((item, order) => ({ id: item.id, title: item.title, description: item.description, order }));
  expect((await capability("publications.photos", { id: "ad", images: selected, observedImages: observed })).error).toBeUndefined();
  expect((await store.read("ad", "ad"))!.body.pendingImageUploadReservations).toEqual([]);
  expect((await store.read("ad", "ad"))!.body.images).toMatchObject(selected);
  expect((await store.page({ kind: "adCleanup" })).items).toMatchObject([{ body: { stage: "handoff", paths: [...original, ...staged.slice(3)].map(item => item.path) } }]);
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  const resumed = { read: readRecord, page: readRecords };
  for (let attempt = 0; attempt < 3; attempt++) expect((await call({ action: "sweep", now: now + photoLeaseMs })).error).toBeUndefined();
  for (const item of [...original, ...staged.slice(3)]) expect((await resumed.read("retirement", item.path, "classifieds_photos"))!.body.status).toBe("retired");
  for (const item of staged.slice(0, 3)) expect((await resumed.read("retirement", item.path, "classifieds_photos"))!.body.status).toBe("linked");
});

test("broad identity deletion leaves content deleted across purge failure and resumes durable D1/R2 cleanup", async () => {
  const linked = photo.parse((await call({ action: "upload", request: upload("profile") })).value);
  const admin = { ...account("administrator", true, true), editor: true };
  const preview = z.object({ title: z.string(), confirmationToken: z.string() }).parse((await capability("profiles.identity.preview", { id: "profile" }, false, { actor: admin })).value);
  const input = { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "identity-r2" };
  const deleted = await capability("profiles.identity.delete", input, true, { actor: admin });
  expect(deleted.error).toBeUndefined();
  expect(deleted.value).toMatchObject({ outcome: "deleted", deletedAds: 1, photoCleanup: { status: "scheduled" } });
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  expect(await persistence.read("profile", "profile")).toBeNull();
  expect(await persistence.read("ad", "ad")).toBeNull();
  expect(z.object({ pending: z.number() }).parse((await call({ action: "sweep", fault: "purge" })).value).pending).toBeGreaterThan(0);
  expect(await persistence.read("profile", "profile")).toBeNull();
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect((await capability("profiles.identity.delete", input, true, { actor: admin })).value).toMatchObject({ outcome: "deleted", replayed: true });
  expect((await call({ action: "sweep", now: now + photoLeaseMs + 1000 })).value).toMatchObject({ completed: 1, pending: 0 });
  expect((await call({ action: "read", path: linked.path, private: true })).value).toBeNull();
  expect((await (await runtime.getR2Bucket("PHOTOS")).head(linked.path))?.size).toBe(0);
});

test("native sanitization normalizes JPEG, PNG and WebP without embedded metadata", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const original = await sharp({ create: { width: 4, height: 3, channels: 3, background: "white" } })
      .withMetadata({ exif: { IFD0: { Copyright: "Private embedded metadata" } } })[format]().toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const result = await call({ action: "sanitize", bytes: [...original] });
    expect(result.error).toBeUndefined();
    const sanitized = z.object({ bytes: z.array(z.number()), mimeType: z.literal("image/jpeg"), sourceMimeType: z.string(), width: z.number(), height: z.number() }).parse(result.value);
    expect(sanitized).toMatchObject({ sourceMimeType: `image/${format}`, width: 4, height: 3 });
    const metadata = await sharp(new Uint8Array(sanitized.bytes)).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 4, height: 3 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  }
});

test.each(["upload", "publish"] as const)("%s cannot link or publish after identity ownership changes while in flight", async (operation) => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const before = (await store.read("ad", "ad"))!;
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set("owner-change", { entered, wait });
  const request = { ...upload(), pendingPublication: true };
  const pending = operation === "upload"
    ? call({ action: "upload", request, gate: "owner-change" })
    : capability("publications.publish", { id: "ad" }, true, { gate: "owner-change" });
  await ready;
  await store.transact(null, async (tx) => {
    const identity = (await tx.read("profile", "profile"))!;
    tx.put({ ...identity, body: { ...identity.body, userId: "current-owner" } });
    return null;
  });
  release();
  expect((await pending).error).toBeDefined();
  const unchanged = (await store.read("ad", "ad"))!;
  expect(unchanged.body.images).toEqual(before.body.images);
  expect(unchanged.body.publicationState).toBe("pending");
  expect((await capability("publications.read", { id: "ad" }, false)).error).toBeDefined();
  if (operation === "upload") {
    expect(unchanged.body.pendingImageUploadReservations).toHaveLength(1);
    expect((await call({ action: "sweep", now: now + photoLeaseMs })).error).toBeUndefined();
  }
  expect((await capability("publications.publish", { id: "ad" }, true, { actor: account("current-owner") })).error).toBeUndefined();
  expect((await store.read("ad", "ad"))!.body.publicationState).toBe("published");
});
