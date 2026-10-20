import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { PersistenceConflict } from "@tudomacae/classifieds-persistence";
import { restartRuntime, now, ad, call, save, barrier, adminActor, capability, taxonomy, classifiedsDatabase } from "./classifiedsRuntimeHarness";

test("public factories preserve rank cursors, scoped slugs and creation replay after deletion/restart", async () => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const core = createClassifiedsCapabilities({ persistence: store, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  for (let index = 0; index < 31; index++) await core.write("categories.create", { name: `Categoria ${index}`, order: index - 15.5, isActive: true, idempotencyKey: `${index}` });
  const pageSchema = z.object({ items: z.array(z.object({ id: z.string(), order: z.number() })), nextCursor: z.string().optional() });
  const first = pageSchema.parse(await core.read("categories.list", { limit: 25 }));
  const second = pageSchema.parse(await core.read("categories.list", { limit: 25, cursor: first.nextCursor }));
  expect(first.items).toHaveLength(25);
  expect(second.items.map(item => item.order)).toEqual([9.5, 10.5, 11.5, 12.5, 13.5, 14.5]);
  expect(second.nextCursor).toBeUndefined();
  const created = z.object({ record: z.object({ id: z.string() }) }).parse(await core.write("categories.create", { name: "Nova", isActive: true, idempotencyKey: "replay" }));
  await core.write("categories.delete", { id: created.record.id });
  await restartRuntime();
  expect((await capability("categories.create", { name: "Nova", isActive: true, idempotencyKey: "replay" })).value).toMatchObject({ status: "replayed", record: { id: created.record.id } });
  expect((await capability("categories.create", { name: "Outra", isActive: true, idempotencyKey: "replay" })).error).toBe("CategoryManagementError");
}, 15_000);

test("area cleanup survives a concurrent edit, preserves other fields and never reclassifies ads", async () => {
  const areas = await taxonomy();
  const id = z.string().parse((await capability("profiles.create", { title: "Titular", contacts: [], activityAreas: areas, operationId: "owned" })).value);
  await save({ ...ad("unchanged-ad", id), body: { ...ad("unchanged-ad", id).body, categoryId: areas[0]!.categoryId, subcategoryId: areas[0]!.subcategoryId } });
  const gate = barrier("edit");
  const edit = capability("profiles.update", { id, title: "Título editado", description: "Preservar descrição" }, { barrier: "edit" });
  await gate.ready;
  expect((await capability("subcategories.delete", areas[0])).error).toBeUndefined();
  gate.release();
  expect((await edit).error).toBeUndefined();
  const read = await capability("profiles.private", { id });
  expect(read.value).toMatchObject({ title: "Título editado", description: "Preservar descrição", activityAreas: [areas[1]], revision: 3 });
  expect((await call({ action: "read", kind: "ad", id: "unchanged-ad" })).value).toMatchObject({ body: { categoryId: areas[0]!.categoryId, subcategoryId: areas[0]!.subcategoryId } });
  expect((await capability("subcategories.delete", areas[0])).error).toBeUndefined();
  expect((await capability("profiles.private", { id })).value).toMatchObject({ revision: 3 });
});

test("subcategory rank ties paginate forward within their parent scope", async () => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const core = createClassifiedsCapabilities({ persistence: store, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const categoryId = z.object({ record: z.object({ id: z.string() }) }).parse(await core.write("categories.create", { name: "Empates", isActive: true, idempotencyKey: "parent" })).record.id;
  for (let index = 0; index < 51; index++) await core.write("subcategories.create", { categoryId, name: `Filha ${index}`, order: 0, isActive: true, idempotencyKey: `child-${index}` });
  const schema = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string().optional() });
  const first = schema.parse(await core.read("subcategories.list", { categoryId, limit: 25 }));
  const second = schema.parse(await core.read("subcategories.list", { categoryId, limit: 25, cursor: first.nextCursor }));
  const third = schema.parse(await core.read("subcategories.list", { categoryId, limit: 25, cursor: second.nextCursor }));
  expect([first.items.length, second.items.length, third.items.length]).toEqual([25, 25, 1]);
  expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size).toBe(51);
  expect(third.nextCursor).toBeUndefined();
}, 20_000);

test("a deletion marker closes an association already evaluated by a concurrent profile creation", async () => {
  const areas = await taxonomy();
  const gate = barrier("associate");
  const creation = capability("profiles.create", { title: "Concorrente", contacts: [], activityAreas: [areas[0]], operationId: "race" }, { barrier: "associate" });
  await gate.ready;
  expect((await capability("subcategories.delete", areas[0])).error).toBeUndefined();
  gate.release();
  expect((await creation).error).toBe("TypeError");
  expect((await capability("profiles.mine", null)).value).toEqual([]);
});

test("administrative confirmation uses all duplicate pages; replay bypasses later taxonomy and duplicate decisions", async () => {
  const areas = await taxonomy();
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  for (let index = 0; index < 41; index++) expect((await capability("profiles.create", { title: "Duplicado", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [areas[0]!], operationId: `duplicate-${index}` })).error).toBeUndefined();
  const input = { title: "Duplicado", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [areas[0]], sourceUrl: "https://example.com/fonte", idempotencyKey: "admin-create" };
  const refusal = await capability("profiles.admin.create", input);
  expect(refusal.error).toBe("AdvertiserProfileAdministrationError");
  expect(refusal.details?.candidates).toHaveLength(41);
  const confirmed = { ...input, duplicateConfirmationToken: refusal.details!.confirmationToken };
  const created = await capability("profiles.admin.create", confirmed);
  expect(created.error, created.message).toBeUndefined();
  const result = z.object({ profileId: z.string(), revision: z.number() }).parse(created.value);
  const unchanged = await capability("profiles.admin.update", { id: result.profileId, expectedRevision: 1, idempotencyKey: "unchanged", patch: { title: "Duplicado" } });
  expect(unchanged.value).toMatchObject({ outcome: "unchanged", revision: 1 });
  const lost = await capability("profiles.admin.delete", { id: result.profileId, expectedRevision: 1, idempotencyKey: "deleted" }, { lostResponse: true });
  expect(lost.error).toBe("Error");
  expect((await capability("profiles.admin.delete", { id: result.profileId, expectedRevision: 1, idempotencyKey: "deleted" })).value).toMatchObject({ outcome: "deleted", replayed: true });
  await capability("subcategories.delete", areas[0]);
  expect((await capability("profiles.admin.create", confirmed)).value).toMatchObject({ profileId: result.profileId, replayed: true });
  const audits = (await store.page({ kind: "audit", limit: 25 })).items;
  expect(audits).toHaveLength(3);
  expect(audits.every(item => !JSON.stringify(item.body).includes("example.com") && !JSON.stringify(item.body).includes("22999999999"))).toBe(true);
});

test("duplicate filters overlap their provider reads, retain complete pages and reject mixed epochs", async () => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const contacts = [{ number: "22999999999", isWhatsapp: true }, { number: "22988888888", isWhatsapp: false }];
  const seedCore = createClassifiedsCapabilities({ persistence: store, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  for (let index = 0; index < 41; index++) await seedCore.write("profiles.create", { title: "Duplicado", contacts, activityAreas: [], operationId: `match-${index}` });
  let pending = 0;
  let maximum = 0;
  const queries = new Map<string, number>();
  const observed = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    const key = query.normalizedTitle ?? query.contact ?? "other";
    queries.set(key, (queries.get(key) ?? 0) + 1);
    maximum = Math.max(maximum, ++pending);
    try {
      return await store.page(query, version);
    }
    finally {
      pending--;
    }
  } };
  const core = createClassifiedsCapabilities({ persistence: observed, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const schema = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string().optional() });
  const first = schema.parse(await core.read("profiles.admin.duplicates", { title: "Duplicado", contacts, limit: 25 }));
  expect(first.items).toHaveLength(25);
  expect(maximum).toBeGreaterThan(1);
  expect([...queries.values()]).toEqual([3, 3, 3]);
  const second = schema.parse(await core.read("profiles.admin.duplicates", { title: "Duplicado", contacts, limit: 25, cursor: first.nextCursor }));
  expect(second.items).toHaveLength(16);
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(41);
  expect(second.nextCursor).toBeUndefined();

  let finishTitle!: () => void;
  const titleDone = new Promise<void>((resolve) => {
    finishTitle = resolve;
  });
  const changed = titleDone.then(() => seedCore.write("profiles.create", { title: "Outro", contacts: [], activityAreas: [], operationId: "epoch-change" }));
  const racing = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    if (query.contact) await changed;
    const page = await store.page(query, version);
    if (query.normalizedTitle && !page.next) finishTitle();
    return page;
  } };
  const racingCore = createClassifiedsCapabilities({ persistence: racing, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  await expect(racingCore.read("profiles.admin.duplicates", { title: "Duplicado", contacts })).rejects.toBeInstanceOf(PersistenceConflict);
}, 20_000);

test("area and ordered taxonomy reads remain bounded as records grow", async () => {
  const areas = await taxonomy();
  const query = { kind: "profile" as const, activityArea: areas[0]!, limit: 1 };
  const baseline = (await call({ action: "page", query })).metrics.at(-1)!.rowsRead;
  for (let index = 0; index < 32; index++) expect((await capability("profiles.create", { title: "Distinto", contacts: [], activityAreas: [areas[1]!], operationId: `unrelated-${index}` })).error).toBeUndefined();
  const after = (await call({ action: "page", query })).metrics.at(-1)!.rowsRead;
  expect(after).toBeLessThanOrEqual(baseline + 2);
  const rankQuery = { kind: "subcategory" as const, categoryId: areas[0]!.categoryId, order: "rank", limit: 1 };
  const rankBaseline = (await call({ action: "page", query: rankQuery })).metrics.at(-1)!.rowsRead;
  for (let index = 0; index < 16; index++) expect((await capability("subcategories.create", { categoryId: areas[0]!.categoryId, name: `Ranked ${index}`, order: 0, isActive: true, idempotencyKey: `ranked-${index}` })).error).toBeUndefined();
  const rankAfter = (await call({ action: "page", query: rankQuery })).metrics.at(-1)!.rowsRead;
  expect(rankAfter).toBeLessThanOrEqual(rankBaseline + 2);
});
