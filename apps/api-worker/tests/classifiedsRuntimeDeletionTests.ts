import { expect, test } from "vitest";
import { appendFile } from "node:fs/promises";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { PersistenceConflict, type PersistenceMetrics, type RecordQuery } from "@tudomacae/classifieds-persistence";
import { runtime, restartRuntime, now, profile, ad, category, intent, call, save, barrier, adminActor, adFields, ownerActor, response, classifiedsDatabase } from "./classifiedsRuntimeHarness";

test.each([undefined, now + 1, now, now - 1])("claimable deletion evaluates the same transaction's photo lease (%s)", async (expiresAt) => {
  const store = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  await save({ kind: "profile", id: "reserved", body: { title: "Perfil", claimable: true, source: { url: "https://example.com", checkedAt: now }, createdAt: now, pendingImageUploadReservations: [{ path: "profile-photos/reserved/pending.png", ...(expiresAt === undefined ? {} : { expiresAt }) }] } });
  const core = createClassifiedsCapabilities({ persistence: store, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const deletion = core.write("profiles.admin.delete", { id: "reserved", expectedRevision: 1, idempotencyKey: "delete" });
  if (expiresAt === undefined || expiresAt > now) {
    await expect(deletion).rejects.toMatchObject({ code: "imageCleanupBlocked" });
    expect(await store.read("profile", "reserved")).not.toBeNull();
  }
  else {
    await expect(deletion).resolves.toMatchObject({ outcome: "deleted" });
    expect(await store.read("profile", "reserved")).toBeNull();
  }
});

test.each([0, 10, 100, 1000])("set deletion scales at %i ads including old reservations/claims", async (count) => {
  await save(profile());
  expect((await call({ action: "seed", id: "profile", count })).error).toBeUndefined();
  const manifest = await call({ action: "manifest", id: "profile" });
  const value = z.object({ version: z.number(), adCount: z.number(), imageCount: z.number() }).parse(manifest.value);
  expect(value.adCount).toBe(count);
  expect(value.imageCount).toBe(count * 13);
  const result = await call({ action: "delete", id: "profile", version: value.version, intent: intent(`scale-${count}`), result: { deletedAds: count } });
  expect(result.error, result.message).toBeUndefined();
  const commit = result.metrics.find(metric => metric.operation === "deleteIdentity")!;
  expect(commit.statements).toBe(8);
  expect(commit.returnedBytes).toBeLessThan(1000);
  if (process.env.CLASSIFIEDS_ENVELOPE_OUTPUT) await appendFile(process.env.CLASSIFIEDS_ENVELOPE_OUTPUT, `${JSON.stringify({ ads: count, artifacts: count * 13, manifest: manifest.metrics, commit })}\n`);
}, 60_000);

test("local transfer preserves legacy revision/version, resumes and detects divergence", async () => {
  const item = { type: "record", record: { ...profile(), sourceVersion: "100:200", body: { ...profile().body, revision: 5 } } };
  expect((await call({ action: "import", item })).error).toBeUndefined();
  expect((await call({ action: "import", item })).value).toEqual({ key: "[\"record\",\"profile\",\"\",\"profile\"]", status: "unchanged" });
  await restartRuntime();
  expect((await call({ action: "import", item })).error).toBeUndefined();
  expect((await call({ action: "import", item: { ...item, record: { ...item.record, body: { ...item.record.body, title: "Diferente" } } } })).error).toBe("PersistenceConflict");
  const exported = await runtime.dispatchFetch("http://classifieds.test/", { method: "POST", body: JSON.stringify({ action: "export" }) });
  const lines = (await exported.text()).trim().split("\n").map(line => JSON.parse(line));
  expect(lines).toEqual([item]);
});

test("maximum catalog, enablement audit and profile evidence commit consistently", async () => {
  await save(profile());
  const items = Array.from({ length: 100 }, (_, n) => ({ id: String(n).padStart(128, "i"), name: "界".repeat(100), description: "界".repeat(1000), visible: true, price: { mode: "fixed", cents: 999999999 }, source: { url: `https://example.com/${"界".repeat(2020)}`, checkedAt: now } }));
  await save({ kind: "catalog", id: "profile", body: { enabled: true, revision: 1, items } }, { kind: "audit", id: "catalog-enabled", body: { actorId: "admin", businessId: "profile", enabled: true, at: now } });
  const sourced = { ...items[0]!, source: { url: "https://example.com/item", checkedAt: now } };
  await save({ kind: "catalog", id: "profile", body: { enabled: true, revision: 2, items: [sourced, ...items.slice(1)] } });
  expect((await call({ action: "read", kind: "catalog", id: "profile" })).value).toMatchObject({ body: { items: [sourced, ...items.slice(1)] } });
  const current = z.object({ version: z.number(), catalogItemCount: z.number() }).parse((await call({ action: "manifest", id: "profile" })).value);
  expect(current.catalogItemCount).toBe(100);
  expect((await call({ action: "delete", id: "profile", version: current.version, intent: intent("max-catalog"), result: { catalogItems: 100 } })).error).toBeUndefined();
  expect((await call({ action: "read", kind: "audit", id: "catalog-enabled" })).value).not.toBeNull();
});

test("creation receipt survives taxonomy removal and concurrent replay has one effect", async () => {
  const request = { action: "transaction", intent: { actorId: "admin", key: "create", operation: "createCategory", input: { name: "Categoria" } }, records: [category("created")] };
  const [left, right] = await Promise.all([call(request), call(request)]);
  expect(left.error).toBeUndefined();
  expect(right.error).toBeUndefined();
  const values = [left.value, right.value].map(value => z.object({ replayed: z.boolean() }).parse(value));
  expect(values.filter(value => value.replayed)).toHaveLength(1);
  await call({ action: "transaction", remove: [{ kind: "category", id: "created" }] });
  expect(z.object({ replayed: z.boolean() }).parse((await call(request)).value).replayed).toBe(true);
  expect((await call({ action: "read", kind: "category", id: "created" })).value).toBeNull();
});

test("retirement/image link read set rejects a racing retirement marker", async () => {
  await save(ad());
  const gate = barrier("retirement");
  const pending = call({ action: "transaction", records: [ad(), { kind: "retirement", id: "image", body: { path: "ad-images/ad/photo.jpg" } }], barrier: "retirement" });
  await gate.ready;
  await save({ kind: "retirement", id: "image", body: { path: "ad-images/ad/photo.jpg", retired: true } });
  gate.release();
  const result = await pending;
  expect(z.object({ value: z.object({ attempts: z.number() }) }).parse(result.value).value.attempts).toBe(2);
});

test("subcategory local IDs/slug claims remain distinct across parent categories and paged transfer", async () => {
  const subcategory = (categoryId: string) => ({ kind: "subcategory", id: "same-id", body: { name: "Outros", slug: "outros", order: 1, isActive: true, categoryId } });
  await save(category("left"), category("right"), subcategory("left"), subcategory("right"));
  const left = z.object({ namespace: z.string(), body: z.object({ categoryId: z.string() }) }).parse((await call({ action: "read", kind: "subcategory", id: "same-id", namespace: "left" })).value);
  expect(left.body.categoryId).toBe("left");
  const page = z.object({ items: z.array(z.object({ id: z.string(), namespace: z.string() })), next: z.string(), version: z.number() }).parse((await call({ action: "page", query: { kind: "subcategory", limit: 1 } })).value);
  expect(page.items).toEqual([{ id: "same-id", namespace: "left" }]);
  const second = z.object({ items: z.array(z.object({ namespace: z.string() })) }).parse((await call({ action: "page", query: { kind: "subcategory", after: page.next }, version: page.version })).value);
  expect(second.items).toEqual([{ namespace: "right" }]);
  await save({ kind: "slugClaim", namespace: "left", id: "outros", body: { subcategoryId: "same-id" } }, { kind: "slugClaim", namespace: "right", id: "outros", body: { subcategoryId: "same-id" } });
  expect((await call({ action: "transaction", remove: [{ kind: "subcategory", id: "same-id", namespace: "left" }] })).error).toBeUndefined();
  expect((await call({ action: "read", kind: "subcategory", id: "same-id", namespace: "right" })).value).not.toBeNull();
});

test("publication profile retry preserves concurrently edited activity areas and advances global revision", async () => {
  await save(profile());
  const gate = barrier("publication");
  const pending = call({ action: "transaction", records: [{ kind: "profile", id: "profile", body: { title: "Nome da publicação", createdAt: now } }, ad()], merge: true, barrier: "publication" });
  await gate.ready;
  await save({ ...profile(), body: { ...profile().body, activityAreas: [{ categoryId: "other", subcategoryId: "other-subcategory" }] } });
  gate.release();
  expect((await pending).error).toBeUndefined();
  const current = z.object({ body: z.object({ title: z.string(), revision: z.number(), activityAreas: z.array(z.object({ categoryId: z.string() })) }) }).parse((await call({ action: "read", kind: "profile", id: "profile" })).value);
  expect(current.body).toMatchObject({ title: "Nome da publicação", revision: 3, activityAreas: [{ categoryId: "other" }] });
});

test("repeated verified conflicts stop after four decisions with no partial operation", async () => {
  await save(profile());
  let gate = barrier("exhausted");
  const pending = call({ action: "transaction", records: [profile()], barrier: "exhausted", barrierEveryAttempt: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    await gate.ready;
    await save(profile());
    const previous = gate;
    gate = barrier("exhausted");
    previous.release();
  }
  expect((await pending).error).toBe("PersistenceConflict");
  const current = z.object({ body: z.object({ revision: z.number() }) }).parse((await call({ action: "read", kind: "profile", id: "profile" })).value);
  expect(current.body.revision).toBe(5);
});

test("actual provider SQL failure is propagated without becoming a business conflict", async () => {
  const result = await runtime.dispatchFetch("http://classifieds.test/", { method: "POST", headers: { "x-fixture-unavailable": "true" }, body: JSON.stringify({ action: "transaction", records: [profile()] }) });
  const value = response.parse(await result.json());
  expect(value.message).toContain("no such table: unavailable_fixture_table");
  expect(value.error).not.toBe("PersistenceConflict");
  expect((await call({ action: "read", kind: "profile", id: "profile" })).value).toBeNull();
});

test.each(["holder", "deleting"])("private list continuation restarts after a profile-only %s change", async (change) => {
  await save(profile(), profile("second"), ad("a"), ad("b", "second"), ad("c"), ad("legacy", ""));
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const query = { kind: "ad", advertiserOwnerId: "owner", order: "createdDesc", limit: 2 } satisfies RecordQuery;
  const first = await persistence.page(query);
  expect(first.items.map(item => item.id)).toEqual(["legacy", "c"]);
  const second = await persistence.page({ ...query, after: first.next }, first.version);
  expect(second.items.map(item => item.id)).toEqual(["b", "a"]);
  await save({ ...profile("second"), body: { ...profile("second").body, ...(change === "holder" ? { userId: "new-holder" } : { deleting: true }) } });
  await expect(persistence.page({ ...query, after: first.next }, first.version)).rejects.toBeInstanceOf(PersistenceConflict);
  expect((await persistence.page(query)).items.map(item => item.id)).toEqual(["legacy", "c"]);
});

test("a late management epoch conflict bounds restart cost at one thousand ads", async () => {
  await save({ ...profile(), body: { ...profile().body, contacts: [{ number: "22999998888", isWhatsapp: true }] } });
  for (let start = 0; start < 1000; start += 16) await save(...Array.from({ length: Math.min(16, 1000 - start) }, (_, offset) => ({ kind: "ad", id: `scale-${String(start + offset).padStart(4, "0")}`, body: { ...adFields, userId: "owner", status: "active", createdAt: now, images: [] } })));
  const database = await classifiedsDatabase();
  const metrics: PersistenceMetrics[] = [];
  const store = createClassifiedsPersistence({ database, observe: (metric) => {
    metrics.push(metric);
  } });
  const legacyPlan = await database.prepare(`EXPLAIN QUERY PLAN SELECT id FROM classifieds_records
    INDEXED BY classifieds_unassociated_owner_created WHERE kind = ? AND kind = 'ad' AND owner_id = ?
    AND (profile_id IS NULL OR profile_id = '') ORDER BY json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC LIMIT ?`)
    .bind("ad", "owner", 25).all<{ detail: string }>();
  const associatedPlan = await database.prepare(`EXPLAIN QUERY PLAN SELECT id FROM classifieds_records
    INDEXED BY classifieds_profile_created WHERE kind = ? AND profile_id = ?
    ORDER BY json_extract(body, '$.createdAt') DESC, namespace DESC, id DESC LIMIT ?`)
    .bind("ad", "profile", 25).all<{ detail: string }>();
  for (const [plan, index] of [[legacyPlan, "classifieds_unassociated_owner_created"], [associatedPlan, "classifieds_profile_created"]] as const) {
    const details = plan.results.map(row => row.detail).join("\n");
    expect(details).toContain(index);
    expect(details).not.toContain("TEMP B-TREE");
  }
  const firstPage = await store.page({ kind: "ad", advertiserOwnerId: "owner", order: "createdDesc", limit: 25 });
  expect(firstPage.items).toHaveLength(25);
  const firstPageMetrics = metrics.filter(metric => metric.operation === "page");
  expect(firstPageMetrics).toHaveLength(1);
  expect(firstPageMetrics[0]!.rowsRead).toBeGreaterThan(0);
  expect(firstPageMetrics[0]!.rowsRead).toBeLessThan(250);
  expect(firstPageMetrics[0]!.returnedBytes).toBeLessThan(15_000);
  if (process.env.CLASSIFIEDS_ENVELOPE_OUTPUT) await appendFile(process.env.CLASSIFIEDS_ENVELOPE_OUTPUT, `${JSON.stringify({ workload: "private-first-page", metrics: firstPageMetrics })}\n`);
  metrics.length = 0;
  const writer = createClassifiedsCapabilities({ persistence: createClassifiedsPersistence({ database }), actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  let calls = 0;
  let lateConflict = false;
  const racing = { ...store, async page(query: Parameters<typeof store.page>[0], version?: number) {
    calls++;
    if (lateConflict && calls === 41) await writer.write("ads.update", { ...adFields, id: "scale-0000", title: "Concurrent" });
    return store.page(query, version);
  } };
  const reader = createClassifiedsCapabilities({ persistence: racing, actor: ownerActor, correlationId: crypto.randomUUID(), now: () => now });
  expect(await reader.read("ads.forOwner", { userId: "owner" })).toHaveLength(1000);
  const baseline = { calls, rowsRead: metrics.filter(metric => metric.operation === "page").reduce((sum, metric) => sum + metric.rowsRead, 0) };
  expect(calls).toBe(41);
  metrics.length = 0;
  calls = 0;
  lateConflict = true;
  expect(await reader.read("ads.forOwner", { userId: "owner" })).toHaveLength(1000);
  const raced = { calls, rowsRead: metrics.filter(metric => metric.operation === "page").reduce((sum, metric) => sum + metric.rowsRead, 0) };
  expect(raced.calls).toBe(82);
  expect(raced.rowsRead).toBeLessThanOrEqual(baseline.rowsRead * 2 + 25);
  expect(metrics.filter(metric => metric.operation === "read")).toHaveLength(1);
  metrics.length = 0;
  calls = 0;
  lateConflict = false;
  expect(await reader.read("publications.mine", {})).toEqual([]);
  expect(calls).toBe(41);
  expect(metrics.filter(metric => metric.operation === "read")).toHaveLength(0);
  if (process.env.CLASSIFIEDS_ENVELOPE_OUTPUT) await appendFile(process.env.CLASSIFIEDS_ENVELOPE_OUTPUT, `${JSON.stringify({ workload: "management-epoch-restart", ads: 1000, baseline, raced })}\n`);
}, 60_000);
