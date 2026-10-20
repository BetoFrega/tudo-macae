import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { identityTypeOf } from "@tudomacae/advertiser-identity/model";
import { now, profile, call, save, barrier, adminActor, adFields, ownerActor, classifiedsDatabase } from "./classifiedsRuntimeHarness";

const owner = { ...adminActor, uid: "owner", admin: false };
const fields = { title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [] };
const asOwner = (operation: string, input: unknown, extra: object = {}) =>
  call({ action: "capability", operation, input, actor: owner, now, ...extra });
const personalProfiles = async () => z.array(z.object({ id: z.string(), identityType: z.string().optional() }))
  .parse((await asOwner("profiles.mine", null)).value)
  .filter(item => item.identityType === "personal");

test("concurrent personal creation and classification keep one personal profile per account", async () => {
  await save(profile("legacy"));
  const gate = barrier("personal");
  const creation = asOwner("profiles.create", { ...fields, identityType: "personal", operationId: "first" }, { barrier: "personal" });
  await gate.ready;
  expect((await asOwner("profiles.classify", { id: "legacy", identityType: "personal" })).error).toBeUndefined();
  gate.release();

  expect((await creation).error).toBe("AdvertiserIdentityTypeConflict");
  expect((await personalProfiles()).map(item => item.id)).toEqual(["legacy"]);
  const business = await asOwner("profiles.create", { ...fields, identityType: "business", operationId: "business" });
  expect(business.error).toBeUndefined();
});

test("typed creation replays the same operation and refuses another type for it", async () => {
  const first = await asOwner("profiles.create", { ...fields, identityType: "personal", operationId: "replay" });
  expect(first.error).toBeUndefined();

  expect((await asOwner("profiles.create", { ...fields, identityType: "personal", operationId: "replay" })).value).toBe(first.value);
  expect((await asOwner("profiles.create", { ...fields, identityType: "business", operationId: "replay" })).error).toBe("AdvertiserProfileCreationPayloadConflict");
  expect(await personalProfiles()).toHaveLength(1);
});

test("classification is owner-only, fixed once confirmed and preserves the profile content", async () => {
  await save(profile("legacy"));
  const before = z.object({ revision: z.number() }).passthrough().parse((await asOwner("profiles.private", { id: "legacy" })).value);

  expect((await call({ action: "capability", operation: "profiles.classify", input: { id: "legacy", identityType: "business" }, actor: { ...owner, uid: "intruder" }, now })).error).toBe("AdvertiserProfileAccessError");
  expect((await asOwner("profiles.classify", { id: "legacy", identityType: "business" })).error).toBeUndefined();
  expect((await asOwner("profiles.classify", { id: "legacy", identityType: "business" })).error).toBeUndefined();
  expect(await asOwner("profiles.classify", { id: "legacy", identityType: "personal" })).toMatchObject({ error: "AdvertiserIdentityTypeConflict" });
  expect((await asOwner("profiles.update", { id: "legacy", title: "Novo nome", description: "", identityType: "personal" })).error).toBeUndefined();

  const after = (await asOwner("profiles.private", { id: "legacy" })).value;
  expect(after).toEqual({ ...before, title: "Novo nome", description: "", identityType: "business", revision: before.revision + 2, updatedAt: expect.any(Number) });
});

test("the personal-profile index rejects writes outside the domain check as a domain conflict", async () => {
  const personal = { ...profile("personal"), body: { ...profile("personal").body, identityType: "personal" } };
  await save(personal);
  expect((await call({ action: "transaction", records: [{ ...personal, id: "direct" }] })).message).toContain("UNIQUE constraint failed");

  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const blind: ClassifiedsPersistence = { ...persistence, transact: (intent, decide) => persistence.transact(intent, tx => decide({
    ...tx, page: async (query, version) => ({ ...(await tx.page(query, version)), items: [] }),
  })) };
  const capabilities = createClassifiedsCapabilities({ persistence: blind, actor: owner, correlationId: "index", now: () => now });
  await expect(capabilities.write("profiles.create", { ...fields, identityType: "personal", operationId: "blind" }))
    .rejects.toMatchObject({ name: "AdvertiserIdentityTypeConflict", reason: "personal-exists" });
});

test("publication profile creation shares the personal-profile guarantee with the account entry", async () => {
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const capabilities = createClassifiedsCapabilities({ persistence, actor: ownerActor, correlationId: "publication", now: () => now });
  const { advertiserProfileId: _profile, ...draft } = adFields;
  await capabilities.write("publications.save", { ...draft, id: "personal-draft" });
  await capabilities.write("profiles.create", { ...fields, identityType: "personal", operationId: "account-personal" });
  const profileInput = { publicationId: "personal-draft", title: "Ana", contacts: [{ number: "22999998888", isWhatsapp: true }] };

  await expect(capabilities.write("publications.profile", { ...profileInput, identityType: "personal" }))
    .rejects.toMatchObject({ name: "AdOperationError", message: expect.stringContaining("Sua conta já tem um perfil pessoal") });
  const profileId = z.string().parse(await capabilities.write("publications.profile", { ...profileInput, identityType: "business" }));
  expect(await capabilities.read("profiles.private", { id: profileId })).toMatchObject({ identityType: "business", userId: "owner" });
});

test("migration 0013 adopts legacy profiles untyped and claimables read as businesses", async () => {
  const database = await classifiedsDatabase();
  const indexApplied = async () => Boolean(await database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'classifieds_personal_profile_owner'").first());
  const claimable = { kind: "profile", id: "claimable", body: { title: "Oficina", claimable: true, source: { url: "https://example.com/oficina", checkedAt: now }, contacts: [], activityAreas: [], createdAt: now } };
  await database.exec("DROP INDEX classifieds_personal_profile_owner");
  try {
    await save(profile("legacy-a"), profile("legacy-b"), claimable);
    await database.exec(await readFile("apps/api-worker/migrations-classifieds/0008_classifieds_personal_profile.sql", "utf8"));
  }
  finally {
    if (!await indexApplied()) await database.exec(await readFile("apps/api-worker/migrations-classifieds/0008_classifieds_personal_profile.sql", "utf8"));
  }

  expect(await indexApplied()).toBe(true);
  const mine = z.array(z.object({ id: z.string(), identityType: z.string().optional() })).parse((await asOwner("profiles.mine", null)).value);
  expect(mine.filter(item => item.id.startsWith("legacy-"))).toEqual([{ id: "legacy-a" }, { id: "legacy-b" }].map(item => expect.objectContaining(item)));
  expect(mine.every(item => item.identityType === undefined)).toBe(true);
  expect((await asOwner("profiles.classify", { id: "legacy-a", identityType: "personal" })).error).toBeUndefined();
  expect((await asOwner("profiles.classify", { id: "legacy-b", identityType: "personal" })).error).toBe("AdvertiserIdentityTypeConflict");
  expect((await asOwner("profiles.classify", { id: "legacy-b", identityType: "business" })).error).toBeUndefined();
  const stored = z.object({ body: z.string() }).parse(await database.prepare("SELECT body FROM classifieds_records WHERE kind = 'profile' AND id = 'claimable'").first());
  expect(identityTypeOf(JSON.parse(stored.body))).toBe("business");
});
