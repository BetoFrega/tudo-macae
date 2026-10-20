import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { PersistenceConflict } from "@tudomacae/classifieds-persistence";
import { now, profile, save, adminActor, capability, adFields, ownerActor, pageInWorker, classifiedsDatabase } from "./classifiedsRuntimeHarness";

test.each(["once", "continuous", "provider"] as const)("public ad pagination restarts a changed epoch without mixing pages (%s)", async (fault) => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  for (let index = 0; index < 27; index++) expect((await capability("ads.create", { ...adFields, id: `ad-${String(index).padStart(2, "0")}` }, { actor: ownerActor })).error).toBeUndefined();
  let calls = 0;
  const starts: (string | undefined)[] = [];
  const unavailable = new Error("Fixture provider unavailable");
  const racing = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    calls++;
    if (version === undefined) starts.push(query.after);
    else if (fault === "provider") throw unavailable;
    else if (fault === "continuous" || calls === 2) expect((await capability("ads.update", { ...adFields, id: "ad-00", title: `Alteração ${calls}` }, { actor: ownerActor })).error).toBeUndefined();
    return pageInWorker(query, version);
  } };
  const core = createClassifiedsCapabilities({ persistence: racing, correlationId: crypto.randomUUID(), now: () => now });
  const after = { createdAt: now, id: "zzzz" };
  const input = { scope: { kind: "all" }, limit: 25, after };
  if (fault === "once") {
    const result = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string() }).parse(await core.read("ads.page", input));
    expect(result.items.map(item => item.id)).toEqual(Array.from({ length: 25 }, (_, index) => `ad-${String(26 - index).padStart(2, "0")}`));
    expect(calls).toBe(4);
    expect(starts).toHaveLength(2);
  }
  else if (fault === "continuous") {
    await expect(core.read("ads.page", input)).rejects.toBeInstanceOf(PersistenceConflict);
    expect(calls).toBe(8);
    expect(starts).toHaveLength(4);
  }
  else {
    await expect(core.read("ads.page", input)).rejects.toBe(unavailable);
    expect(calls).toBe(2);
    expect(starts).toHaveLength(1);
  }
  expect(new Set(starts)).toEqual(new Set([JSON.stringify([after.createdAt, "", after.id])]));
});

test.each(["ads.all", "ads.forOwner", "publications.mine", "ads.forProfile"] as const)("ad list retries an epoch change from its original start (%s)", async (operation) => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  await owner.write("ads.create", { ...adFields, id: "completed" });
  await owner.write("publications.save", { ...adFields, id: "draft" });
  let calls = 0;
  const starts: (string | undefined)[] = [];
  const racing = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    calls++;
    if (version === undefined) starts.push(query.after);
    if (calls === 2) await owner.write("ads.update", { ...adFields, id: "completed", title: "Fresh title" });
    return store.page(query, version);
  } };
  const reader = createClassifiedsCapabilities({ persistence: racing, actor: operation === "ads.all" ? adminActor : ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  const input = operation === "ads.forOwner" ? { userId: "owner" } : operation === "ads.forProfile" ? { profileId: "profile" } : {};
  const result = z.array(z.object({ id: z.string(), title: z.string() })).parse(await reader.read(operation, input));
  expect(result).toContainEqual({ id: operation === "publications.mine" ? "draft" : "completed", title: operation === "publications.mine" ? adFields.title : "Fresh title" });
  expect(starts).toEqual([undefined, undefined]);
  expect(calls).toBe(4);
});

test.each(["continuous", "provider"] as const)("management pagination bounds conflict retries and preserves provider errors (%s)", async (fault) => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  await owner.write("ads.create", { ...adFields, id: "completed" });
  let calls = 0;
  const unavailable = new Error("Fixture provider unavailable");
  const racing = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    calls++;
    if (version !== undefined) {
      if (fault === "provider") throw unavailable;
      await owner.write("ads.update", { ...adFields, id: "completed", title: `Changed ${calls}` });
    }
    return store.page(query, version);
  } };
  const reader = createClassifiedsCapabilities({ persistence: racing, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  if (fault === "provider") await expect(reader.read("ads.forOwner", { userId: "owner" })).rejects.toBe(unavailable);
  else await expect(reader.read("ads.forOwner", { userId: "owner" })).rejects.toBeInstanceOf(PersistenceConflict);
  expect(calls).toBe(fault === "provider" ? 2 : 8);
});

test("public ad responses project only declared fields and visible image metadata", async () => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  await owner.write("ads.create", { ...adFields, id: "public" });
  const record = (await store.read("ad", "public"))!;
  await save({ ...record, body: { ...record.body, publicationState: "published", transferEvidence: "private", pendingImageCleanupPaths: ["removed"], pendingImageCleanupClaims: ["claimed"], pendingImageUploadReservations: [{ path: "reserved", expiresAt: now + 1 }], images: [{ id: "visible", path: "legacy/photo.jpg", order: 0, title: "Photo", transferEvidence: "private" }, { id: "pending", path: "hidden/photo.jpg", order: 1, pending: true }] } });
  const guest = createClassifiedsCapabilities({ persistence: store, correlationId: crypto.randomUUID(), now: () => now });
  const responses = [await guest.read("ads.read", { id: "public" }), z.object({ items: z.array(z.unknown()) }).parse(await guest.read("ads.page", { scope: { kind: "all" }, limit: 25 })).items[0], z.array(z.unknown()).parse(await guest.read("ads.forProfile", { profileId: "profile" }))[0]];
  for (const value of responses) {
    expect(Object.keys(value as object).toSorted()).toEqual(["id", "userId", "title", "text", "slug", "status", "categoryId", "subcategoryId", "advertiserProfileId", "images", "createdAt"].toSorted());
    expect(value).toMatchObject({ images: [{ id: "visible", path: "legacy/photo.jpg", order: 0, title: "Photo" }] });
    expect(JSON.stringify(value)).not.toContain("private");
    expect(JSON.stringify(value)).not.toContain("removed");
  }
});

test.each([
  { kind: "all" },
  { kind: "category", categoryId: "category" },
  { kind: "subcategory", categoryId: "category", subcategoryId: "subcategory" },
  { kind: "profile", profileId: "profile" },
])("public pages omit deleting ads while advancing an empty page cursor (%j)", async (scope) => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  for (const id of ["d", "c", "b", "a"]) await owner.write("ads.create", { ...adFields, id });
  for (const id of ["d", "c"]) {
    const record = (await store.read("ad", id))!;
    // Transferred deletion-in-progress records retain active status until recovery completes.
    await save({ ...record, body: { ...record.body, deleting: true } });
  }
  let scanned = 0;
  const observed = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    const result = await store.page(query, version);
    scanned += result.items.length;
    return result;
  } };
  const guest = createClassifiedsCapabilities({ persistence: observed, correlationId: crypto.randomUUID(), now: () => now });
  const pageSchema = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string().optional() });
  const first = pageSchema.parse(await guest.read("ads.page", { scope, limit: 2 }));
  expect(first.items).toEqual([]);
  expect(scanned).toBe(3);
  expect(first.nextCursor).toBeDefined();
  const after = z.object({ after: z.object({ id: z.string(), createdAt: z.number() }) }).parse(JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString())).after;
  expect(after.id).toBe("c");
  scanned = 0;
  const second = pageSchema.parse(await guest.read("ads.page", { scope, limit: 2, after }));
  expect(second.items.map(item => item.id)).toEqual(["b", "a"]);
  expect(second.nextCursor).toBeUndefined();
  expect(scanned).toBe(2);
});

test("pending listings authorize only pending records, share profiles per call and renew ownership", async () => {
  await save(...[profile(), profile("history")].map(record => ({ ...record, body: { ...record.body, contacts: [{ number: "22999998888", isWhatsapp: true }] } })));
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  for (let index = 0; index < 9; index++) await owner.write("ads.create", { ...adFields, id: `completed-${index}`, advertiserProfileId: "history" });
  for (const id of ["draft-one", "draft-two"]) await owner.write("publications.save", { ...adFields, id });
  let profileReads = 0;
  const observed = { ...store, async read(kind: Parameters<typeof store.read>[0], id: string, namespace?: string) {
    if (kind === "profile") {
      profileReads++;
      expect(id).not.toBe("history");
    }
    return store.read(kind, id, namespace);
  } };
  const reader = createClassifiedsCapabilities({ persistence: observed, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  expect(z.array(z.object({ id: z.string() })).parse(await reader.read("publications.mine", {})).map(item => item.id).toSorted()).toEqual(["draft-one", "draft-two"]);
  expect(profileReads).toBe(1);
  const record = (await store.read("profile", "profile"))!;
  await save({ ...record, body: { ...record.body, userId: "new-owner" } });
  expect(await reader.read("publications.mine", {})).toEqual([]);
  expect(profileReads).toBe(1);
});

test("saving a draft clears an omitted profile while preserving photos and cleanup evidence", async () => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  await owner.write("publications.save", { ...adFields, id: "draft" });
  const record = (await store.read("ad", "draft"))!;
  await save({ ...record, body: { ...record.body, obsoleteTransferField: "discard", images: [{ id: "photo", path: "legacy/photo.jpg", order: 0 }], pendingImageCleanupClaims: ["claimed"] } });
  const { advertiserProfileId: _profile, ...fields } = adFields;
  await owner.write("publications.save", { ...fields, id: "draft", title: "Changed" });
  const stored = (await store.read("ad", "draft"))!.body;
  expect(stored).not.toHaveProperty("advertiserProfileId");
  expect(stored).not.toHaveProperty("obsoleteTransferField");
  expect(stored).toMatchObject({ title: "Changed", createdAt: now, revision: 3, images: [{ id: "photo", path: "legacy/photo.jpg", order: 0 }], pendingImageCleanupClaims: ["claimed"] });
  expect(await owner.read("publications.read", { id: "draft" })).not.toHaveProperty("advertiserProfileId");
});
