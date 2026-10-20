import { describe, expect, test } from "vitest";
import { identityTypeOf, isTransferableAdvertiserProfile, type AdvertiserProfileData } from "../model";
import { profileFixture } from "./profileFixtures";

const fields = { title: "Ana", description: "", contacts: [{ number: "22999999999", isWhatsapp: true }] };

describe("advertiser identity types", () => {
  test("creates a personal profile and a business for the same account", async () => {
    const { profiles } = profileFixture();
    const personal = await profiles.create({ ...fields, userId: "owner", identityType: "personal" });
    const business = await profiles.create({ ...fields, title: "Oficina", userId: "owner", identityType: "business" });

    expect((await profiles.read({ id: personal }))?.identityType).toBe("personal");
    expect((await profiles.read({ id: business }))?.identityType).toBe("business");
  });

  test("rejects a second personal profile for the same account only", async () => {
    const { profiles } = profileFixture();
    await profiles.create({ ...fields, userId: "owner", identityType: "personal" });

    await expect(profiles.create({ ...fields, userId: "owner", identityType: "personal" }))
      .rejects.toMatchObject({ name: "AdvertiserIdentityTypeConflict", reason: "personal-exists" });
    await expect(profiles.create({ ...fields, userId: "other", identityType: "personal" })).resolves.toBeTypeOf("string");
  });

  test("keeps untyped creation for compositions without identity types", async () => {
    const { profiles } = profileFixture({ identityTypes: false });
    const id = await profiles.create({ ...fields, userId: "owner" });

    expect((await profiles.read({ id }))?.identityType).toBeUndefined();
    await expect(profiles.create({ ...fields, userId: "owner", identityType: "business" }))
      .rejects.toThrow("Tipo de identidade indisponível");
  });

  test("replays a typed creation and rejects the same operation with another type", async () => {
    const { profiles } = profileFixture();
    const input = { ...fields, userId: "owner", operationId: "operation", identityType: "personal" as const };
    const id = await profiles.create(input);

    expect(await profiles.create(input)).toBe(id);
    await expect(profiles.create({ ...input, identityType: "business" }))
      .rejects.toMatchObject({ name: "AdvertiserProfileCreationPayloadConflict" });
  });

  test("ignores the type in ordinary edits", async () => {
    const { profiles } = profileFixture();
    const id = await profiles.create({ ...fields, userId: "owner", identityType: "business" });

    await profiles.update({ ...fields, id, identityType: "personal" } as Parameters<typeof profiles.update>[0]);

    expect((await profiles.read({ id }))?.identityType).toBe("business");
  });

  test("classifies an untyped owned profile once and preserves its content", async () => {
    const { profiles } = profileFixture();
    const id = await profiles.create({ ...fields, userId: "owner", activityAreas: [{ categoryId: "c", subcategoryId: "s" }] });
    const before = await profiles.read({ id });

    await profiles.classify({ id, userId: "owner", identityType: "personal" });
    await profiles.classify({ id, userId: "owner", identityType: "personal" });

    const after = await profiles.read({ id });
    expect(after).toMatchObject({ ...before, identityType: "personal", revision: 2 });
    await expect(profiles.classify({ id, userId: "owner", identityType: "business" }))
      .rejects.toMatchObject({ name: "AdvertiserIdentityTypeConflict", reason: "already-classified" });
  });

  test("rejects classifying a second personal profile", async () => {
    const { profiles } = profileFixture();
    await profiles.create({ ...fields, userId: "owner", identityType: "personal" });
    const legacy = await profiles.create({ ...fields, userId: "owner" });

    await expect(profiles.classify({ id: legacy, userId: "owner", identityType: "personal" }))
      .rejects.toMatchObject({ name: "AdvertiserIdentityTypeConflict", reason: "personal-exists" });
    await profiles.classify({ id: legacy, userId: "owner", identityType: "business" });
    expect((await profiles.read({ id: legacy }))?.identityType).toBe("business");
  });

  test("allows only the owner to classify an owned profile", async () => {
    const { profiles, seedRecord } = profileFixture();
    const id = await profiles.create({ ...fields, userId: "owner" });
    seedRecord({ ...fields, id: "claimable", claimable: true, source: { url: "https://example.com", checkedAt: 1 }, createdAt: 1, updatedAt: 1 });

    await expect(profiles.classify({ id, userId: "intruder", identityType: "business" }))
      .rejects.toMatchObject({ name: "AdvertiserProfileAccessError", reason: "forbidden" });
    await expect(profiles.classify({ id: "claimable", userId: "owner", identityType: "business" }))
      .rejects.toMatchObject({ name: "AdvertiserProfileAccessError", reason: "not-found" });
    await expect(profiles.classify({ id: "missing", userId: "owner", identityType: "business" }))
      .rejects.toMatchObject({ name: "AdvertiserProfileAccessError", reason: "not-found" });
  });
});

describe("derived identity type", () => {
  const profile = (overrides: Partial<AdvertiserProfileData>): AdvertiserProfileData => ({ id: "p", title: "Ana", description: "", createdAt: 1, updatedAt: 1, ...overrides });

  test("treats claimable profiles as businesses and legacy owned profiles as pending", () => {
    expect(identityTypeOf(profile({ claimable: true, source: { url: "https://example.com", checkedAt: 1 } }))).toBe("business");
    expect(identityTypeOf(profile({ userId: "owner" }))).toBeUndefined();
    expect(identityTypeOf(profile({ userId: "owner", identityType: "personal" }))).toBe("personal");
  });

  test("allows ownership transfer only for businesses", () => {
    expect(isTransferableAdvertiserProfile(profile({ userId: "owner", identityType: "business" }))).toBe(true);
    expect(isTransferableAdvertiserProfile(profile({ userId: "owner", identityType: "personal" }))).toBe(false);
    expect(isTransferableAdvertiserProfile(profile({ userId: "owner" }))).toBe(false);
  });
});
