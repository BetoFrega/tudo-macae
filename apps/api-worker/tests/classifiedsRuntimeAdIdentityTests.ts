import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { type PersistenceMetrics } from "@tudomacae/classifieds-persistence";
import { now, profile, save, adminActor, adFields, ownerActor, classifiedsDatabase } from "./classifiedsRuntimeHarness";

test("private ads and pending publications follow the current identity owner without leaking to the former owner", async () => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const originalOwner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  await originalOwner.write("ads.create", { ...adFields, id: "transferred" });
  await originalOwner.write("publications.save", { ...adFields, id: "transferred-draft" });
  await store.importRecord({ kind: "ad", id: "still-owned", body: {
    userId: "owner", advertiserProfileId: "", title: "Legado", text: "Conteúdo próprio sem identidade", slug: "legado",
    categoryId: "category", subcategoryId: "subcategory", status: "active", createdAt: now + 1,
  } });
  await store.importRecord({ kind: "ad", id: "still-owned-plain", body: {
    userId: "owner", title: "Legado sem campo", text: "Conteúdo próprio sem identidade", slug: "legado-sem-campo",
    categoryId: "category", subcategoryId: "subcategory", status: "active", createdAt: now + 2,
  } });
  const identity = (await store.read("profile", "profile"))!;
  await save({ ...identity, body: { ...identity.body, userId: "current-owner" } });
  for (let start = 0; start < 32; start += 8) await save(...Array.from({ length: 8 }, (_, offset) => {
    const index = start + offset;
    return { kind: "ad", id: `unrelated-${index}`, body: {
      userId: "unrelated-owner", advertiserProfileId: `unrelated-profile-${index}`, title: "Outro anúncio",
      text: "Conteúdo fora da lista", slug: `outro-${index}`, categoryId: "category", subcategoryId: "subcategory",
      status: "active", createdAt: now, images: [],
    } };
  }));

  const metrics: PersistenceMetrics[] = [];
  const measured = createClassifiedsPersistence({
    database: await classifiedsDatabase(),
    observe: (value) => {
      metrics.push(value);
    },
  });
  const currentOwner = createClassifiedsCapabilities({ persistence: measured, actor: { ...ownerActor, uid: "current-owner" }, correlationId: crypto.randomUUID(), now: () => now });
  const formerOwner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  const thirdParty = createClassifiedsCapabilities({ persistence: store, actor: { ...ownerActor, uid: "third-party" }, correlationId: crypto.randomUUID(), now: () => now });

  expect(await currentOwner.read("ads.owned", { id: "transferred" })).toMatchObject({ id: "transferred" });
  metrics.length = 0;
  expect(z.array(z.object({ id: z.string() })).parse(await currentOwner.read("ads.forOwner", { userId: "current-owner" })).map(item => item.id)).toEqual(["transferred"]);
  const pages = metrics.filter(item => item.operation === "page");
  expect(pages.length).toBeGreaterThan(0);
  const selectedRows = pages.reduce((total, item) => total + item.rowsRead, 0);
  expect(selectedRows).toBeLessThanOrEqual(32);
  for (let start = 32; start < 128; start += 8) await save(...Array.from({ length: 8 }, (_, offset) => ({ kind: "ad", id: `unrelated-${start + offset}`, body: { userId: "foreign", advertiserProfileId: "foreign-profile", createdAt: now, status: "active" } })));
  metrics.length = 0;
  expect(await currentOwner.read("ads.forOwner", { userId: "current-owner" })).toHaveLength(1);
  expect(metrics.filter(item => item.operation === "page").reduce((total, item) => total + item.rowsRead, 0)).toBe(selectedRows);
  await currentOwner.write("ads.update", { ...adFields, id: "transferred", status: "paused" });
  await currentOwner.write("publications.save", { ...adFields, id: "transferred-draft", title: "Rascunho retomado" });
  expect(z.array(z.object({ id: z.string() })).parse(await currentOwner.read("publications.mine", {})).map(item => item.id)).toContain("transferred-draft");
  expect(z.array(z.object({ id: z.string() })).parse(await formerOwner.read("ads.forOwner", { userId: "owner" })).map(item => item.id)).toEqual(["still-owned-plain", "still-owned"]);
  expect(await formerOwner.read("publications.mine", {})).toEqual([]);
  await expect(formerOwner.read("ads.owned", { id: "transferred" })).rejects.toMatchObject({ code: "forbidden" });
  await expect(thirdParty.read("publications.read", { id: "transferred-draft" })).rejects.toMatchObject({ code: "forbidden" });
  expect(await store.read("ad", "still-owned")).toBeTruthy();
});

test.each(["ads.update", "publications.save", "publications.profile"] as const)("%s revalidates identity ownership after a concurrent change before commit", async (operation) => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  await owner.write(operation === "ads.update" ? "ads.create" : "publications.save", { ...adFields, id: "racing" });
  const before = await store.read("ad", "racing");
  let reached!: () => void;
  let resume!: () => void;
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let paused = false;
  const racing: typeof store = { ...store, transact: (intent, decide) => store.transact(intent, tx => decide({ ...tx, async read(...args) {
    const value = await tx.read(...args);
    if (!paused && args[0] === "profile") {
      paused = true;
      reached();
      await gate;
    }
    return value;
  } })) };
  const contender = createClassifiedsCapabilities({ persistence: racing, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  const input = operation === "publications.profile"
    ? { publicationId: "racing", profileId: "profile", title: "Alterado", contacts: [{ number: "22999998888", isWhatsapp: true }] }
    : { ...adFields, id: "racing", title: "Alterado", status: "paused" };
  const result = contender.write(operation, input);
  const denied = expect(result).rejects.toMatchObject({ code: "forbidden" });
  await ready;
  const identity = (await store.read("profile", "profile"))!;
  await save({ ...identity, body: { ...identity.body, userId: "current-owner" } });
  resume();
  await denied;
  expect(await store.read("ad", "racing")).toEqual(before);
  const current = createClassifiedsCapabilities({ persistence: store, actor: { ...ownerActor, uid: "current-owner" }, correlationId: crypto.randomUUID(), now: () => now });
  await expect(current.write(operation, input)).resolves.toBeDefined();
});

test("creation receipt replay rechecks current identity authority and preserves administrator editing", async () => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const directReads: string[] = [];
  const observed = { ...store, async read(...args: Parameters<typeof store.read>) {
    directReads.push(args[0]);
    return store.read(...args);
  } };
  const former = createClassifiedsCapabilities({ persistence: observed, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  const input = { ...adFields, id: "replayed" };
  expect(await former.write("ads.create", input)).toMatchObject({ id: "replayed" });
  expect(directReads).toEqual([]);
  expect(await former.write("ads.create", input)).toMatchObject({ id: "replayed" });
  expect(directReads).toEqual(["ad", "profile"]);
  directReads.length = 0;
  const identity = (await store.read("profile", "profile"))!;
  await save({ ...identity, body: { ...identity.body, userId: "current-owner" } });
  const before = await store.read("ad", "replayed");
  await expect(former.write("ads.create", input)).rejects.toMatchObject({ code: "forbidden" });
  expect(await store.read("ad", "replayed")).toEqual(before);
  const administrator = createClassifiedsCapabilities({ persistence: store, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  await expect(administrator.write("ads.update", { ...input, title: "Editado pelo administrador", status: "active" })).resolves.toBeDefined();
});

test("ad list authorization reads each profile once per invocation and never reuses the cache", async () => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const owner = createClassifiedsCapabilities({ persistence: store, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  for (let index = 0; index < 10; index++) await owner.write("ads.create", { ...adFields, id: `owned-${index}` });
  let profileReads = 0;
  const observed = { ...store, async read(...args: Parameters<typeof store.read>) {
    if (args[0] === "profile") profileReads++;
    return store.read(...args);
  } };
  const reader = createClassifiedsCapabilities({ persistence: observed, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  expect(await reader.read("ads.forOwner", { userId: "owner" })).toHaveLength(10);
  expect(profileReads).toBe(1);
  expect(await reader.read("ads.forOwner", { userId: "owner" })).toHaveLength(10);
  expect(profileReads).toBe(2);
  const admin = createClassifiedsCapabilities({ persistence: observed, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  expect(await admin.read("ads.all", {})).toHaveLength(10);
  expect(profileReads).toBe(3);
  await expect(reader.read("ads.forOwner", { userId: "other" })).rejects.toMatchObject({ code: "forbidden" });
});
