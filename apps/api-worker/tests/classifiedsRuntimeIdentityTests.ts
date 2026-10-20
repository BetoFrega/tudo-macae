import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { restartRuntime, now, profile, ad, category, call, save, adminActor, classifiedsDatabase } from "./classifiedsRuntimeHarness";

test("offering catalog rechecks authority, revisions and source privacy through its public factory", async () => {
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  await save(profile(), category("category"), { kind: "subcategory", id: "subcategory", namespace: "category", body: { name: "Subcategoria", slug: "subcategory", order: 1, isActive: true, categoryId: "category" } });
  const dependencies = { persistence, correlationId: "catalog", now: () => now, newId: () => "item", offeringFlag: async () => "enabled" as const };
  const owner = createClassifiedsCapabilities({ ...dependencies, actor: { ...adminActor, uid: "owner", admin: false } });
  const admin = createClassifiedsCapabilities({ ...dependencies, actor: adminActor });
  const visitor = createClassifiedsCapabilities(dependencies);
  const item = { name: "Consulta", description: "Atendimento", price: { mode: "from", amount: "12,50" }, sourceUrl: "https://source.test/private" };
  const initial = { businessId: "profile", expectedRevision: 0, operationId: "save", item };
  expect(await owner.write("offerings.save", initial)).toMatchObject({ revision: 1, items: [{ id: "item", visible: false, price: { mode: "from", cents: 1250 } }] });
  expect(await visitor.read("offerings.public", { businessId: "profile" })).toBeNull();
  await admin.write("offerings.enablement", { businessId: "profile", expectedRevision: 1, enabled: true, operationId: "enable" });
  await owner.write("offerings.visibility", { businessId: "profile", expectedRevision: 2, itemId: "item", visible: true, operationId: "visible" });
  expect(await visitor.read("offerings.public", { businessId: "profile" })).toEqual({ items: [{ id: "item", name: "Consulta", description: "Atendimento", price: { mode: "from", cents: 1250 } }] });
  await admin.write("offerings.save", { ...initial, operationId: "admin-source", expectedRevision: 3, item: { ...item, id: "item" } });
  expect(await admin.read("offerings.management", { businessId: "profile" })).toMatchObject({ items: [{ source: { url: item.sourceUrl } }] });
  expect(JSON.stringify(await owner.read("offerings.management", { businessId: "profile" }))).not.toContain(item.sourceUrl);
  expect(JSON.stringify(await visitor.read("offerings.public", { businessId: "profile" }))).not.toContain(item.sourceUrl);
  await expect(owner.write("offerings.enablement", { businessId: "profile", expectedRevision: 3, enabled: false, operationId: "deny", actor: { id: "admin", admin: true } })).rejects.toMatchObject({ outcome: "authorization" });
  await expect(owner.write("offerings.visibility", { businessId: "profile", expectedRevision: 0, itemId: "item", visible: false, operationId: "stale" })).rejects.toMatchObject({ outcome: "conflict" });
});

test("machine catalog writes require the current editor role for owners and administrators", async () => {
  await save(profile(), { kind: "catalog", id: "profile", body: { enabled: false, revision: 1, items: [{ id: "item", name: "Consulta", description: "", visible: false, price: { mode: "on_request" } }] } });
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const dependencies = { persistence, correlationId: "catalog-roles", now: () => now, offeringFlag: async () => "enabled" as const };
  const commands = [
    ["offerings.save", { item: { id: "item", name: "Atualizada", description: "", price: { mode: "on_request" } } }],
    ["offerings.visibility", { itemId: "item", visible: true }],
    ["offerings.enablement", { enabled: true }],
  ] as const;
  for (const actor of [{ uid: "owner", admin: false }, { uid: "admin", admin: true }]) {
    const machine = createClassifiedsCapabilities({ ...dependencies, actor: { ...actor, editor: false, channel: "mcp" } });
    for (const [operation, input] of commands) {
      const operationId = `${actor.uid}-${operation.split(".")[1]}`;
      await expect(machine.write(operation, { ...input, businessId: "profile", expectedRevision: 1, operationId })).rejects.toMatchObject({ reason: "forbidden" });
      expect(await persistence.readReceipt(actor.uid, operationId)).toBeNull();
    }
  }
  expect((await persistence.read("catalog", "profile"))?.body).toMatchObject({ revision: 1, enabled: false, items: [{ name: "Consulta", visible: false }] });
  const human = createClassifiedsCapabilities({ ...dependencies, actor: { uid: "owner", admin: false, editor: false, channel: "administration" } });
  expect(await human.write("offerings.visibility", { businessId: "profile", expectedRevision: 1, operationId: "human", itemId: "item", visible: true })).toMatchObject({ revision: 2 });
  const machine = createClassifiedsCapabilities({ ...dependencies, actor: { uid: "owner", admin: false, editor: true, channel: "mcp" } });
  expect(await machine.write("offerings.visibility", { businessId: "profile", expectedRevision: 2, operationId: "editor", itemId: "item", visible: false })).toMatchObject({ revision: 3 });
});

test("identity factory deletes the complete associated set and replays after restart without touching another identity", async () => {
  await save(profile(), profile("other"), ad("active"), { ...ad("paused"), body: { ...ad("paused").body, status: "paused" } }, { ...ad("pending"), body: { ...ad("pending").body, publicationState: "pending" } }, ad("foreign", "other"), ad("unassociated", ""), { kind: "catalog", id: "profile", body: { enabled: true, revision: 1, items: [{ id: "service", name: "Consulta", description: "", visible: true, price: { mode: "on_request" } }] } });
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const capabilities = () => createClassifiedsCapabilities({ persistence, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const preview = z.object({ confirmationToken: z.string(), title: z.string(), ads: z.array(z.object({ id: z.string() })), catalogItems: z.array(z.object({ id: z.string() })) }).parse(await capabilities().read("profiles.identity.preview", { id: "profile" }));
  expect(preview.ads.map(item => item.id).sort()).toEqual(["active", "paused", "pending"]);
  expect(preview.catalogItems).toEqual([{ id: "service" }]);
  const input = { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitação do titular", idempotencyKey: "identity-delete" };
  const result = await capabilities().write("profiles.identity.delete", input);
  expect(result).toMatchObject({ outcome: "deleted", replayed: false, deletedAds: 3, photoCleanup: { status: "scheduled" } });
  expect((await persistence.manifest("profile", now))).toMatchObject({ profile: null, adCount: 0, catalogItemCount: 0 });
  expect(await persistence.read("ad", "foreign")).not.toBeNull();
  expect(await persistence.read("ad", "unassociated")).not.toBeNull();
  expect(await persistence.read("profile", "other")).not.toBeNull();
  await restartRuntime();
  const restarted = createClassifiedsCapabilities({ persistence: createClassifiedsPersistence({ database: await classifiedsDatabase() }), actor: adminActor, correlationId: crypto.randomUUID(), now: () => now + 1000 });
  expect(await restarted.write("profiles.identity.delete", input)).toMatchObject({ ...z.record(z.string(), z.unknown()).parse(result), replayed: true });
  await expect(restarted.write("profiles.identity.delete", { ...input, reason: "Outro intento" })).rejects.toMatchObject({ code: "idempotencyConflict" });
});

test("identity confirmation cannot authorize another profile with the same title and epoch", async () => {
  await save(profile(), profile("other"), ad("first"), ad("second", "other"));
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  expect((await persistence.manifest("profile", now)).version).toBe((await persistence.manifest("other", now)).version);
  const core = createClassifiedsCapabilities({ persistence, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const previewSchema = z.object({ title: z.string(), confirmationToken: z.string() });
  const preview = previewSchema.parse(await core.read("profiles.identity.preview", { id: "profile" }));
  const input = { id: "other", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "distinct-identity" };
  await expect(core.write("profiles.identity.delete", input)).rejects.toMatchObject({ code: "revisionConflict" });
  expect(await persistence.readReceipt("admin", input.idempotencyKey)).toBeNull();
  for (const id of ["profile", "other"]) expect((await persistence.manifest(id, now))).toMatchObject({ profile: expect.anything(), adCount: 1 });
  const correct = previewSchema.parse(await core.read("profiles.identity.preview", { id: "other" }));
  expect(await core.write("profiles.identity.delete", { ...input, confirmationToken: correct.confirmationToken })).toMatchObject({ outcome: "deleted", deletedAds: 1 });
  expect((await persistence.manifest("profile", now))).toMatchObject({ profile: expect.anything(), adCount: 1 });
});

for (const change of ["profile", "catalog", "membership", "photos"] as const) {
  test(`identity confirmation rejects concurrent ${change} changes without consuming the receipt`, async () => {
    await save(profile(), ad());
    const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
    const core = createClassifiedsCapabilities({ persistence, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
    const previewSchema = z.object({ title: z.string(), confirmationToken: z.string() });
    const preview = previewSchema.parse(await core.read("profiles.identity.preview", { id: "profile" }));
    if (change === "profile") await save({ ...profile(), body: { ...profile().body, title: "Atualizado" } });
    if (change === "catalog") await save({ kind: "catalog", id: "profile", body: { enabled: false, revision: 1, items: [] } });
    if (change === "membership") await save(ad("additional"));
    if (change === "photos") await save({ ...ad(), body: { ...ad().body, pendingImageUploadReservations: [{ path: "ad-images/ad/new.jpg", expiresAt: now + 1000 }] } });
    const input = { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "stale-delete" };
    await expect(core.write("profiles.identity.delete", input)).rejects.toMatchObject({ code: "revisionConflict" });
    expect(await persistence.readReceipt("admin", input.idempotencyKey)).toBeNull();
    expect((await persistence.manifest("profile", now)).profile).not.toBeNull();
  });
}
for (const blocker of ["reservation", "legacy"] as const) {
  test(`identity ${blocker} blocks deletion and offers recovery without removing content`, async () => {
    await save(profile(), { ...ad(), body: { ...ad().body,
      ...(blocker === "reservation"
        ? { pendingImageUploadReservations: [{ path: "ad-images/ad/reserved.jpg", expiresAt: now + 1000 }] }
        : { images: [{ path: "ad-images/ad/old name.jpg", order: 0 }] }),
    } });
    const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
    const core = createClassifiedsCapabilities({ persistence, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
    const preview = z.object({ title: z.string(), confirmationToken: z.string() }).parse(await core.read("profiles.identity.preview", { id: "profile" }));
    await expect(core.write("profiles.identity.delete", { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "blocked" })).rejects.toMatchObject({ code: "imageCleanupBlocked", message: expect.stringContaining(blocker === "reservation" ? "Aguarde" : "Meus anúncios") });
    expect(await persistence.read("profile", "profile")).not.toBeNull();
    expect(await persistence.read("ad", "ad")).not.toBeNull();
  });
}
test("identity deletion preserves the same administrator boundary for human and machine and the restricted legacy delete", async () => {
  await save(profile(), ad());
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  for (const actor of [undefined, { ...adminActor, admin: false }, { ...adminActor, channel: "mcp" as const, editor: false }]) {
    const core = createClassifiedsCapabilities({ persistence, actor, correlationId: crypto.randomUUID(), now: () => now });
    await expect(core.read("profiles.identity.preview", { id: "profile", actorId: "admin", channel: "administration" })).rejects.toMatchObject({ reason: "forbidden" });
    await expect(core.write("profiles.identity.delete", { id: "profile", actorId: "admin", channel: "administration" })).rejects.toMatchObject({ reason: "forbidden" });
  }
  const machine = createClassifiedsCapabilities({ persistence, actor: { ...adminActor, channel: "mcp" }, correlationId: crypto.randomUUID(), now: () => now });
  const preview = z.object({ title: z.string(), confirmationToken: z.string() }).parse(await machine.read("profiles.identity.preview", { id: "profile" }));
  const legacy = { id: "profile", expectedRevision: 1, idempotencyKey: "legacy" };
  await expect(machine.write("profiles.admin.delete", legacy)).rejects.toMatchObject({ code: "stateMismatch" });
  expect(await machine.write("profiles.identity.delete", { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "machine" })).toMatchObject({ outcome: "deleted" });
});

test("identity aggregate rollback preserves all contents and retry commits one durable receipt", async () => {
  await save(profile(), ad());
  const database = await classifiedsDatabase();
  const persistence = createClassifiedsPersistence({ database });
  const core = createClassifiedsCapabilities({ persistence, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const preview = z.object({ title: z.string(), confirmationToken: z.string() }).parse(await core.read("profiles.identity.preview", { id: "profile" }));
  const input = { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "rollback" };
  // Provider fault after removal statements verifies the real SQL batch rollback.
  await database.exec("CREATE TRIGGER fixture_reject_audit BEFORE INSERT ON classifieds_records WHEN NEW.kind = 'audit' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END;");
  await expect(core.write("profiles.identity.delete", input)).rejects.toThrow("fixture audit failure");
  expect((await persistence.manifest("profile", now))).toMatchObject({ adCount: 1, profile: expect.anything() });
  expect(await persistence.readReceipt("admin", "rollback")).toBeNull();
  expect((await persistence.page({ kind: "adCleanup" })).items).toEqual([]);
  await database.exec("DROP TRIGGER fixture_reject_audit;");
  expect(await core.write("profiles.identity.delete", input)).toMatchObject({ outcome: "deleted", replayed: false });
  expect(await core.write("profiles.identity.delete", input)).toMatchObject({ outcome: "deleted", replayed: true });
  expect((await persistence.page({ kind: "audit" })).items).toHaveLength(1);
});

test("identity factory confirms and removes a set larger than the CRUD envelope with bounded receipt effects", async () => {
  await save(profile());
  expect((await call({ action: "seed", id: "profile", count: 150 })).error).toBeUndefined();
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const core = createClassifiedsCapabilities({ persistence, actor: adminActor, correlationId: crypto.randomUUID(), now: () => now });
  const preview = z.object({ title: z.string(), confirmationToken: z.string(), ads: z.array(z.unknown()) }).parse(await core.read("profiles.identity.preview", { id: "profile" }));
  expect(preview.ads).toHaveLength(150);
  const result = z.object({ deletedAds: z.number(), cacheTags: z.array(z.string()) }).parse(await core.write("profiles.identity.delete", { id: "profile", confirmedTitle: preview.title, confirmationToken: preview.confirmationToken, reason: "Solicitado", idempotencyKey: "large-identity" }));
  expect(result.deletedAds).toBe(150);
  expect(result.cacheTags).toHaveLength(4);
  expect((await persistence.manifest("profile", now)).adCount).toBe(0);
});
