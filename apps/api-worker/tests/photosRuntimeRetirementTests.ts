import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClassifiedsPersistence } from "../classifieds";
import { publicImageCacheGeneration } from "@tudomacae/public-image-delivery/cacheTag";
import { now, runtime, gates, call, startRuntime, upload, photo, png, classifiedsDatabase } from "./photosRuntimeHarness";
test("retirement wins against a delayed writer and a purge retry preserves its marker", async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set("late", { entered, wait });
  const request = upload();
  const pending = call({ action: "upload", request, gate: "late" });
  await ready;
  const path = `ad-images/ad/pending/${request.operationId}.png`;
  expect((await call({ action: "remove", path })).value).toMatchObject({ status: "scheduled" });
  expect((await call({ action: "sweep", fault: "purge" })).value).toMatchObject({ completed: 0, pending: 1 });
  release();
  expect((await pending).code).toBe("retired");
  expect((await call({ action: "sweep", now: now + 60_000 })).value).toMatchObject({ completed: 1 });
  const marker = await (await runtime.getR2Bucket("PHOTOS")).head(path);
  expect(marker?.size).toBe(0);
  expect(marker?.customMetadata?.classifiedsRetired).toBe("1");
});
test("profile reservation enters deletion confirmation and P1 deletion intents finish through the same lifecycle", async () => {
  const request = upload("profile");
  await call({ action: "reserve", request });
  expect((await call({ action: "manifest" })).value).toMatchObject({ activeReservations: 1 });
  expect((await call({ action: "delete" })).error).toBe("IdentityCleanupBlocked");
  const profilePhoto = photo.parse((await call({ action: "upload", request })).value);
  const adPhoto = photo.parse((await call({ action: "upload", request: upload() })).value);
  expect((await call({ action: "delete" })).error).toBeUndefined();
  expect((await call({ action: "sweep" })).value).toMatchObject({ completed: 2, pending: 0 });
  for (const path of [profilePhoto.path, adPhoto.path]) expect((await call({ action: "read", path, private: true })).value).toBeNull();
});
test("a missing confirmed object remains uncertain rather than becoming purge success", async () => {
  const result = photo.parse((await call({ action: "upload", request: upload() })).value);
  await (await runtime.getR2Bucket("PHOTOS")).delete(result.path);
  await call({ action: "remove", path: result.path });
  expect((await call({ action: "sweep" })).value).toMatchObject({ completed: 0, pending: 1 });
  expect((await call({ action: "sweep", now: now + 60_000 })).value).toMatchObject({ completed: 0, pending: 1 });
});

test.each(["authorization", "rate_limit", "timeout", "transport", "verify"] as const)("cleanup retains bounded %s cause and layer without private identifiers", async (fault) => {
  const request = upload();
  const result = photo.parse((await call({ action: "upload", request })).value);
  await call({ action: "remove", path: result.path });
  const pending = await call({ action: "sweep", fault });
  expect(pending.value).toMatchObject({ completed: 0, pending: 1 });
  const cleanup = pending.events.filter(event => typeof event === "object" && event !== null && "operation" in event && event.operation === "cleanup");
  const cause = fault === "verify" ? "verification" : fault;
  expect(cleanup).toContainEqual({ operation: "cleanup", outcome: "pending", cause, layer: fault === "verify" ? "visibility" : "worker", operationId: request.operationId });
  if (fault !== "verify") expect(cleanup).toContainEqual({ operation: "cleanup", outcome: "pending", cause, layer: "resizing", operationId: request.operationId });
  expect(JSON.stringify(cleanup)).not.toMatch(/ad-images|https:|private details|photo-ad/);
});
test("historical inventory transfers generation, digest and privacy through real R2/D1 and repeats safely", async () => {
  const bytes = upload("profile").bytes;
  const path = "profile-photos/profile/history.png";
  await call({ action: "save", records: [{ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }], createdAt: now, photoPath: path } }] });
  const inventory = { path, id: "history", ownerKind: "profile", ownerId: "profile", operationId: crypto.randomUUID(), expectedRevision: 2, mimeType: "image/png", size: bytes.length, digest: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"), sourceGeneration: "source-1", title: "", description: "" };
  expect((await call({ action: "transfer", inventory, bytes })).value).toMatchObject({ status: "verified" });
  expect(await (await runtime.getR2Bucket("PHOTOS")).head(path)).toBeNull();
  expect((await call({ action: "transfer", inventory, bytes, dryRun: false })).value).toMatchObject({ status: "imported" });
  expect((await call({ action: "transfer", inventory, bytes, dryRun: false })).value).toMatchObject({ status: "unchanged" });
  expect((await call({ action: "transfer", inventory, bytes, generation: "wrong", dryRun: false })).code).toBe("conflict");
  expect((await call({ action: "read", path })).value).toMatchObject({ bytes });
});

test("provider purge acceptance requires visibility verification and retains the original targets across restart", async () => {
  const result = photo.parse((await call({ action: "upload", request: upload() })).value);
  await call({ action: "remove", path: result.path });
  const pending = await call({ action: "sweep", fault: "verify" });
  expect(pending.value).toMatchObject({ completed: 0, pending: 1 });
  expect(pending.events).toContainEqual({ operation: "purge", layer: "resizing", tagCount: 1, fileCount: 1 });
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  expect((await call({ action: "sweep", now: now + 60_000 })).value).toMatchObject({ completed: 1 });
});

test("legacy owner IDs use safe new keys and preserve raw historical keys through retirement", async () => {
  const bytes = png;
  for (const [ownerKind, ownerId] of [["ad", "negócio 1"], ["ad", "a".repeat(200)], ["profile", "publication-" + "p".repeat(200)]] as const) {
    await call({ action: "save", records: [{ kind: ownerKind, id: ownerId, body: { userId: "owner", title: "Histórico", createdAt: now, ...(ownerKind === "ad" ? { status: "active", publicationState: "pending", images: [] } : {}) } }] });
    const linked = photo.parse((await call({ action: "upload", request: { ...upload(ownerKind), ownerId } })).value);
    expect((await call({ action: "read", path: linked.path, private: true })).value).toMatchObject({ bytes });
    if (ownerId === "negócio 1") expect(linked.path).toMatch(/^ad-images\/_legacy\/[a-f0-9]{64}\/pending\//);
  }
  const ownerId = "perfil histórico";
  const path = `profile-photos/${ownerId}/old.png`;
  await call({ action: "save", records: [{ kind: "profile", id: ownerId, body: { userId: "owner", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }], createdAt: now, photoPath: path } }] });
  const inventory = { path, id: "photo", ownerKind: "profile", ownerId, operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png", size: bytes.length, digest: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"), sourceGeneration: "source-1", title: "", description: "" };
  expect((await call({ action: "transfer", inventory, bytes, dryRun: false })).value).toMatchObject({ status: "imported" });
  expect((await call({ action: "read", path })).value).toMatchObject({ bytes });
  await call({ action: "remove", path });
  const swept = await call({ action: "sweep" });
  expect(swept.value).toMatchObject({ completed: 1, pending: 0 });
  expect(swept.events).toContainEqual({ operation: "fixtureTargets", files: [
    `https://photos.test/api/classifieds/photos/public/${encodeURIComponent(path)}?cache_generation=${publicImageCacheGeneration}`,
  ] });
  expect((await (await runtime.getR2Bucket("PHOTOS")).head(path))?.size).toBe(0);
});

test("Profile replacement leaves unmanaged and foreign-owned previous images intact", async () => {
  const bucket = await runtime.getR2Bucket("PHOTOS");
  const unmanaged = "shared-media/photo.png";
  await bucket.put(unmanaged, new Uint8Array(png));
  await call({ action: "save", records: [{ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }], createdAt: now, photoPath: unmanaged } }] });
  const replacement = photo.parse((await call({ action: "upload", request: { ...upload("profile"), expectedRevision: 2 } })).value);
  expect((await call({ action: "read", path: replacement.path })).value).toMatchObject({ bytes: png });
  expect((await bucket.head(unmanaged))?.size).toBe(png.length);
  await call({ action: "save", records: [{ kind: "profile", id: "other", body: { userId: "owner", title: "Outro", createdAt: now } }] });
  const foreign = photo.parse((await call({ action: "upload", request: { ...upload("profile"), ownerId: "other" } })).value);
  await call({ action: "save", records: [{ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }], createdAt: now, photoPath: foreign.path } }] });
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const revision = z.number().parse((await persistence.read("profile", "profile"))!.body.revision);
  expect((await call({ action: "upload", request: { ...upload("profile"), expectedRevision: revision } })).value).toMatchObject({ status: "linked" });
  expect((await call({ action: "sweep" })).value).toMatchObject({ completed: 0, pending: 0 });
  expect((await bucket.head(foreign.path))?.size).toBe(png.length);
  expect((await call({ action: "read", path: foreign.path })).value).toMatchObject({ bytes: png });
});

test.each(["delete", "adminDelete"])("%s schedules and retires managed hashed Profile photos", async (action) => {
  const ownerId = "perfil com acentuação";
  await call({ action: "save", records: [{ kind: "profile", id: ownerId, body: { userId: "owner", title: "Perfil", description: "", createdAt: now, updatedAt: now } }] });
  const linked = photo.parse((await call({ action: "upload", request: { ...upload("profile"), ownerId } })).value);
  expect(linked.path).toMatch(/^profile-photos\/_legacy\/[a-f0-9]{64}\//);
  if (action === "adminDelete") {
    const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
    await persistence.transact(null, async (tx) => {
      const record = (await tx.read("profile", ownerId))!;
      const { userId: _, ...body } = record.body;
      tx.put({ ...record, body: { ...body, claimable: true, source: { url: "https://source.example", checkedAt: now } } });
      return null;
    });
  }
  const deleted = await call({ action, ownerId });
  expect(deleted.error).toBeUndefined();
  expect((await call({ action: "sweep" })).value).toMatchObject({ completed: 1, pending: 0 });
  expect((await call({ action: "read", path: linked.path, private: true })).value).toBeNull();
  expect((await (await runtime.getR2Bucket("PHOTOS")).head(linked.path))?.size).toBe(0);
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  expect(await persistence.read("profile", ownerId)).toBeNull();
  expect((await persistence.read("retirement", linked.path, "classifieds_photos"))?.body.status).toBe("retired");
});
