import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { persistenceLimits } from "@tudomacae/classifieds-persistence/records";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore } from "../classifiedsPhotos";
import { createPhotoLifecycle } from "@tudomacae/classifieds-photos";
import { now, bytes, record, provider, classifiedsDatabase } from "./hostedPhotosRuntimeHarness";
test("public and private photo lookups, HEAD and withdrawal probes write zero D1 rows", async () => {
  const database = await classifiedsDatabase();
  const metrics: { rowsWritten: number }[] = [];
  const persistence = createClassifiedsPersistence({ database, observe: (event) => {
    metrics.push(event);
  } });
  await persistence.transact(null, async (tx) => {
    await tx.read("profile", "profile");
    tx.put({ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", createdAt: now } });
    await tx.read("ad", "ad");
    tx.put({ kind: "ad", id: "ad", body: { userId: "owner", advertiserProfileId: "profile", publicationState: "pending", status: "active", createdAt: now, images: [] } });
    return null;
  });
  const p = provider(`ad-images/ad/pending/${record.operationId}.png`);
  const objects = await p.objects();
  const lifecycle = createPhotoLifecycle({
    store: createD1PhotoStore(database, persistence), objects,
    decode: async () => ({ mimeType: "image/png", width: 1, height: 1 }),
    digest: async value => createHash("sha256").update(value).digest("hex"),
    now: () => now, newId: () => crypto.randomUUID(),
    purge: { prepare: async () => {}, verify: async () => ({ success: true }) }, observe: () => {},
  });
  const actor = { uid: "owner", admin: false };
  const linked = await lifecycle.upload(actor, { ownerKind: "ad", ownerId: "ad", operationId: record.operationId, expectedRevision: 1, mimeType: "image/png", bytes });
  async function noWrites(check: () => Promise<void>) {
    metrics.length = 0;
    await check();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.reduce((total, metric) => total + metric.rowsWritten, 0)).toBe(0);
  }
  await noWrites(async () => {
    expect(await lifecycle.read(linked.path)).toBeNull();
    expect(await lifecycle.readAd("ad", linked.id, undefined, true)).toBeNull();
    expect(await lifecycle.read(linked.path, actor)).toEqual({ bytes, mimeType: "image/png" });
    await expect(lifecycle.read(linked.path, { uid: "other", admin: false })).rejects.toMatchObject({ code: "forbidden" });
    expect(await lifecycle.read("absent")).toBeNull();
    expect(await lifecycle.revoked("absent")).toBe(false);
  });
  await persistence.transact(null, async (tx) => {
    const ad = (await tx.read("ad", "ad"))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "published" } });
    return null;
  });
  await noWrites(async () => {
    expect(await lifecycle.readAd("ad", linked.id)).toEqual({ bytes, mimeType: "image/png" });
    expect(await lifecycle.readAd("ad", linked.id, undefined, true)).toEqual({ bytes: new Uint8Array(), mimeType: "image/png" });
    expect(await lifecycle.revoked(linked.path)).toBe(false);
  });
  const read = objects.read;
  objects.read = async (value) => {
    const result = await read(value);
    const writer = createClassifiedsPersistence({ database });
    await writer.transact(null, async (tx) => {
      const ad = (await tx.read("ad", "ad"))!;
      tx.put({ ...ad, body: { ...ad.body, publicationState: "pending" } });
      return null;
    });
    return result;
  };
  await noWrites(async () => {
    expect(await lifecycle.read(linked.path)).toBeNull();
  });
  objects.read = read;
  await persistence.transact(null, async (tx) => {
    const ad = (await tx.read("ad", "ad"))!;
    tx.put({ ...ad, body: { ...ad.body, publicationState: "published" } });
    return null;
  });
  await noWrites(async () => {
    p.items.clear();
    await expect(lifecycle.read(linked.path)).rejects.toMatchObject({ code: "unavailable" });
  });
  await lifecycle.remove(actor, linked.path);
  await noWrites(async () => {
    expect(await lifecycle.read(linked.path)).toBeNull();
    expect(await lifecycle.readAd("ad", linked.id, undefined, true)).toBeNull();
    expect(await lifecycle.revoked(linked.path)).toBe(true);
  });
});

test("read-only snapshots discard torn ownership and bound retries under continuing D1 changes", async () => {
  const database = await classifiedsDatabase();
  const writer = createClassifiedsPersistence({ database });
  await writer.transact(null, async (tx) => {
    await tx.read("profile", "profile");
    tx.put({ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", createdAt: now } });
    await tx.read("ad", "ad");
    tx.put({ kind: "ad", id: "ad", body: { userId: "owner", advertiserProfileId: "profile", status: "active", createdAt: now } });
    return null;
  });
  let mutations = 0;
  let always = false;
  const metrics: { rowsWritten: number }[] = [];
  const persistence = createClassifiedsPersistence({ database, observe: (event) => {
    metrics.push(event);
  } });
  const store = createD1PhotoStore(database, { ...persistence, snapshot: decide => persistence.snapshot(snapshot => decide({ async read(kind, id, namespace) {
    const result = await snapshot.read(kind, id, namespace);
    if (kind === "profile" && (mutations === 0 || always)) {
      mutations++;
      await writer.transact(null, async (tx) => {
        const profile = (await tx.read("profile", "profile"))!;
        tx.put({ ...profile, body: { ...profile.body, userId: "new-owner", deleting: true } });
        return null;
      });
    }
    return result;
  } })) });
  expect(await store.read(reader => reader.owner("ad", "ad"))).toMatchObject({ userId: "new-owner", deleting: true });
  expect(mutations).toBe(1);
  expect(metrics.reduce((total, metric) => total + metric.rowsWritten, 0)).toBe(0);
  always = true;
  await expect(store.read(reader => reader.owner("ad", "ad"))).rejects.toMatchObject({ name: "PersistenceConflict" });
  expect(mutations).toBe(1 + persistenceLimits.attempts);
  expect(metrics.reduce((total, metric) => total + metric.rowsWritten, 0)).toBe(0);
});

test("point snapshots ignore unrelated writes but detect missing-record ABA before returning", async () => {
  const database = await classifiedsDatabase();
  const writer = createClassifiedsPersistence({ database });
  await writer.importRecord({ kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", createdAt: now } });
  const metrics: { rowsWritten: number }[] = [];
  const persistence = createClassifiedsPersistence({ database, observe: (event) => {
    metrics.push(event);
  } });
  let decisions = 0;
  expect(await persistence.snapshot(async (reader) => {
    decisions++;
    const owner = await reader.read("profile", "profile");
    await writer.importRecord({ kind: "profile", id: `unrelated-${decisions}`, body: { title: "Outro", createdAt: now } });
    return owner?.body.userId;
  })).toBe("owner");
  expect(decisions).toBe(1);
  decisions = 0;
  expect(await persistence.snapshot(async (reader) => {
    decisions++;
    const missing = await reader.read("profile", "missing");
    if (decisions === 1) {
      await writer.importRecord({ kind: "profile", id: "missing", body: { title: "Transitório", createdAt: now } });
      await writer.transact(null, async (tx) => {
        await tx.read("profile", "missing");
        tx.remove("profile", "missing");
        return null;
      });
      throw new Error("Decision from a stale absence");
    }
    return missing;
  })).toBeNull();
  expect(decisions).toBe(2);
  expect(metrics.reduce((total, metric) => total + metric.rowsWritten, 0)).toBe(0);
});
