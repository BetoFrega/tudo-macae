import { afterEach, beforeEach, expect, test } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore } from "../classifiedsPhotos";
import { createPhotoLifecycle, type PhotoDependencies } from "@tudomacae/classifieds-photos";

let runtime: Miniflare;
const classifiedsDatabase = () => runtime.getD1Database("CLASSIFIEDS_DB");
let directory: string;
let options: ConstructorParameters<typeof Miniflare>[0];
let now: number;
let paid: number;
let writes: number;
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const actor = { uid: "owner", admin: false };
const request = (ownerId = "first") => ({ ownerKind: "profile" as const, ownerId, operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png" as const, bytes });

async function store() {
  const database = await classifiedsDatabase();
  return createD1PhotoStore(database, createClassifiedsPersistence({ database }));
}
async function lifecycle(decode: PhotoDependencies["decode"] = async () => {
  paid++;
  return { mimeType: "image/png", width: 1, height: 1 };
}) {
  return createPhotoLifecycle({
    store: await store(), now: () => now, newId: () => crypto.randomUUID(), decode,
    digest: async value => createHash("sha256").update(value).digest("hex"),
    objects: {
      create: async () => {
        writes++;
        return "generation";
      },
      head: async () => true, read: async () => ({ bytes, mimeType: "image/png" }), retire: async () => {},
    },
    purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: () => {},
  });
}
beforeEach(async () => {
  now = 1_800_000_000_000;
  paid = 0;
  writes = 0;
  directory = await mkdtemp(join(tmpdir(), "photo-admission-"));
  options = { resourcePersistencePath: directory, workers: [{ config: {
    name: "admission", type: "worker", compatibilityDate: "2026-09-25", env: { CLASSIFIEDS_DB: { type: "d1", id: "admission" } },
    manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: "export default { fetch() { return new Response('ok'); } };" } }, modulesRoot: directory },
  } }] };
  runtime = new Miniflare(options);
  await runtime.ready;
  const database = await classifiedsDatabase();
  for (const migration of ["0001_classifieds.sql", "0002_classifieds_lookups.sql", "0003_classifieds_photos.sql", "0004_classifieds_ad_order.sql", "0005_classifieds_cleanup_handoffs.sql"]) await database.exec(await readFile(`apps/api-worker/migrations-classifieds/${migration}`, "utf8"));
  await createClassifiedsPersistence({ database }).transact(null, async (tx) => {
    for (const id of ["first", "second"]) {
      await tx.read("profile", id);
      tx.put({ kind: "profile", id, body: { userId: actor.uid, title: "Perfil", createdAt: now } });
    }
    return null;
  });
});
afterEach(async () => {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
});

test("legacy D1 reservations must acquire admission after runtime restart", async () => {
  const input = request();
  const record = await (await lifecycle()).reserve(actor, input);
  const { processingAttempts: _attempts, decodedAt: _decoded, admissionOnly: _admission, ...legacy } = record;
  await (await store()).transact(async (tx) => {
    await tx.photo(record.path);
    await tx.quota(actor.uid);
    await tx.quota(null);
    tx.savePhoto(legacy);
    tx.saveQuota(actor.uid, { uploads: Array.from({ length: 20 }, () => now) });
    tx.saveQuota(null, { uploads: [] });
  });
  paid = 0;
  await runtime.dispose();
  runtime = new Miniflare(options);
  await runtime.ready;
  await expect((await lifecycle()).upload(actor, input)).rejects.toMatchObject({ code: "rate_limit" });
  expect(paid).toBe(0);
  expect(writes).toBe(0);
  now += 300_000;
  expect(await (await lifecycle()).upload(actor, input)).toMatchObject({ status: "linked", processingAttempts: 1 });
  expect(paid).toBe(1);
  expect(writes).toBe(1);
  expect(await (await store()).transact(tx => tx.quota(null))).toEqual({ uploads: [now] });
});

test("concurrent D1 admissions share the final account slot and survive runtime restart", async () => {
  await (await store()).transact(async (tx) => {
    await tx.quota(actor.uid);
    await tx.quota(null);
    tx.saveQuota(actor.uid, { uploads: Array.from({ length: 19 }, () => now) });
    tx.saveQuota(null, { uploads: Array.from({ length: 19 }, () => now) });
  });
  const photos = await lifecycle();
  const requests = [request(), request("second")];
  const results = await Promise.allSettled(requests.map(input => photos.upload(actor, input)));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const denied = results.findIndex(result => result.status === "rejected");
  expect(results[denied]).toMatchObject({ reason: { code: "rate_limit", reason: "account_burst" } });
  expect(paid).toBe(1);
  expect(writes).toBe(1);
  await runtime.dispose();
  runtime = new Miniflare(options);
  await runtime.ready;
  await expect((await lifecycle()).upload(actor, requests[denied]!)).rejects.toMatchObject({ code: "rate_limit" });
  expect(await (await store()).transact(tx => tx.quota(actor.uid))).toMatchObject({ uploads: Array.from({ length: 20 }, () => now) });
  now += 300_000;
  expect(await (await lifecycle()).upload(actor, requests[denied]!)).toMatchObject({ status: "linked" });
  expect(paid).toBe(2);
});

test("processing failure receipts persist three attempts across D1 restarts without reserving an owner slot", async () => {
  const input = request();
  const decode = async () => {
    paid++;
    throw new Error("Decoder unavailable");
  };
  for (let i = 0; i < 3; i++) {
    await expect((await lifecycle(decode)).upload(actor, input)).rejects.toThrow("Decoder unavailable");
    await runtime.dispose();
    runtime = new Miniflare(options);
    await runtime.ready;
  }
  await expect((await lifecycle(decode)).upload(actor, input)).rejects.toMatchObject({ code: "retired" });
  const db = await store();
  expect(await db.transact(tx => tx.quota(actor.uid))).toMatchObject({ uploads: [now] });
  expect(await db.read(reader => reader.owner("profile", "first"))).toMatchObject({ revision: 1, reservations: [] });
  expect(await db.read(reader => reader.photo(`profile-photos/first/${input.operationId}.png`))).toMatchObject({ processingAttempts: 3, admissionOnly: true });
  expect(paid).toBe(3);
  expect(writes).toBe(0);
});

test("withdrawal during paid decoding prevents a late object write without refunding admission", async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const input = request();
  const photos = await lifecycle(async () => {
    entered();
    await wait;
    return { mimeType: "image/png", width: 1, height: 1 };
  });
  const pending = photos.upload(actor, input);
  await ready;
  await photos.remove(actor, `profile-photos/first/${input.operationId}.png`);
  release();
  await expect(pending).rejects.toMatchObject({ code: "retired" });
  expect(writes).toBe(0);
  expect(await (await store()).transact(tx => tx.quota(actor.uid))).toMatchObject({ uploads: [now] });
});

test("concurrent accounts share one global slot before any paid effect", async () => {
  const database = await classifiedsDatabase();
  await createClassifiedsPersistence({ database }).transact(null, async (tx) => {
    const owner = (await tx.read("profile", "second"))!;
    tx.put({ ...owner, body: { ...owner.body, userId: "other" } });
    return null;
  });
  await (await store()).transact(async (tx) => {
    await tx.quota(null);
    tx.saveQuota(null, { uploads: Array.from({ length: 999 }, () => now) });
  });
  const photos = await lifecycle();
  const results = await Promise.allSettled([photos.upload(actor, request()), photos.upload({ uid: "other", admin: false }, { ...request("second"), expectedRevision: 2 })]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "rate_limit", reason: "global_daily" } });
  expect((await (await store()).transact(tx => tx.quota(null))).uploads).toHaveLength(1000);
  expect(paid).toBe(1);
  expect(writes).toBe(1);
});

test("a concurrent same-intent retry neither spends a quota nor starts another decoder", async () => {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const input = request();
  const photos = await lifecycle(async () => {
    paid++;
    entered();
    await wait;
    return { mimeType: "image/png", width: 1, height: 1 };
  });
  const pending = photos.upload(actor, input);
  await ready;
  await expect((await lifecycle()).upload(actor, input)).rejects.toMatchObject({ code: "conflict" });
  release();
  const linked = await pending;
  expect(await (await lifecycle()).upload(actor, input)).toEqual(linked);
  expect(await (await store()).transact(tx => tx.quota(actor.uid))).toMatchObject({ uploads: [now] });
  expect(paid).toBe(1);
  expect(writes).toBe(1);
});
