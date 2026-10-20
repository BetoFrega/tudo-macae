import { describe, expect, test } from "vitest";
import { profileFixture } from "./profileFixtures";
import { createAdvertiserProfiles } from "../profiles";
import type { AdvertiserProfileData } from "../model";

const area = { categoryId: "category", subcategoryId: "subcategory" };

describe("advertiser profile activity areas", () => {
  test("photo replacement rejects a stale revision without restoring fields", async () => {
    const { profiles, afterNextRead } = profileFixture();
    const input = { userId: "owner", title: "Original", description: "Original", contacts: [], activityAreas: [area] };
    const id = await profiles.create(input);
    afterNextRead(() => profiles.update({ ...input, id, title: "Editado", description: "Descrição editada", activityAreas: [] }));
    await expect(profiles.replacePhoto({ id, photoPath: "new-photo.webp", expectedRevision: 1 }))
      .rejects.toThrow("Revisão atual: 2");
    await expect(profiles.read({ id })).resolves.toMatchObject({
      title: "Editado", description: "Descrição editada", activityAreas: [],
    });
    await expect(profiles.read({ id })).resolves.not.toHaveProperty("photoPath");
  });

  test("accepts zero to three unique activity areas", async () => {
    const { profiles } = profileFixture();
    const id = await profiles.create({
      userId: "owner",
      title: "Perfil",
      description: "",
      contacts: [],
      activityAreas: [
        area,
        { categoryId: "another", subcategoryId: "one" },
        { categoryId: "another", subcategoryId: "two" },
      ],
    });
    await expect(profiles.read({ id })).resolves.toMatchObject({
      activityAreas: [
        area,
        { categoryId: "another", subcategoryId: "one" },
        { categoryId: "another", subcategoryId: "two" },
      ],
    });
    await expect(
      profiles.update({
        id,
        title: "Perfil",
        description: "",
        contacts: [],
        activityAreas: [],
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects a duplicate pair and a fourth activity area", async () => {
    const { profiles } = profileFixture();
    await expect(
      profiles.create({
        userId: "owner",
        title: "Perfil",
        description: "",
        contacts: [],
        activityAreas: [area, area],
      }),
    ).rejects.toThrow(
      "Uma área de atuação não pode ser selecionada duas vezes",
    );
    await expect(
      profiles.create({
        userId: "owner",
        title: "Perfil",
        description: "",
        contacts: [],
        activityAreas: [
          area,
          { categoryId: "a", subcategoryId: "a" },
          { categoryId: "b", subcategoryId: "b" },
          { categoryId: "c", subcategoryId: "c" },
        ],
      }),
    ).rejects.toThrow("Máximo de 3 áreas de atuação");
  });

  test("rejects a pair whose category or active subcategory is unavailable", async () => {
    const { profiles } = profileFixture();
    const unavailable = { categoryId: "missing", subcategoryId: "missing" };
    const profile = (await import("../profiles")).createAdvertiserProfiles({
      now: () => 1,
      digest: value => value,
      ownsAdImagePath: (adId, path) => path.startsWith(`ad-images/${adId}/`),
      newCorrelationId: () => "profile-delete-test",
      reportImageCleanupSkipped: () => {},
      activityAreaCatalog: {
        isActive: async candidate =>
          candidate.categoryId !== unavailable.categoryId,
      },
      store: {
        create: async (_record, validate) => {
          await validate({ isActive: async () => false });
          return "profile";
        },
        update: async () => {},
        classify: async () => {},
        getById: async () => null,
        getByUserId: async () => [],
        getAll: async () => [],
        getByActivityArea: async () => [],
        updateActivityAreas: async () => {},
        delete: async () => {},
        deleteClaimable: async () => {},
      },
    });
    await expect(
      profile.create({
        userId: "owner",
        title: "Perfil",
        description: "",
        contacts: [],
        activityAreas: [unavailable],
      }),
    ).rejects.toThrow("Categoria ou subcategoria inválida ou inativa");
    expect(profiles).toBeDefined();
  });

  test("refuses an edit that retains an inactive area without losing profile data", async () => {
    const { profiles, setActivityAreasAreActive } = profileFixture();
    const id = await profiles.create({
      userId: "owner",
      title: "Título original",
      description: "Descrição original",
      contacts: [],
      activityAreas: [area],
    });
    setActivityAreasAreActive(false);

    await expect(
      profiles.update({
        id,
        title: "Título que não deve ser salvo",
        description: "Descrição que não deve ser salva",
        contacts: [],
        activityAreas: [area],
      }),
    ).rejects.toThrow("Categoria ou subcategoria inválida ou inativa");
    await expect(profiles.read({ id })).resolves.toMatchObject({
      title: "Título original",
      description: "Descrição original",
      activityAreas: [area],
    });
  });

  test("removes only the requested activity area and is safe to repeat", async () => {
    const { profiles } = profileFixture();
    const retained = { categoryId: "other-category", subcategoryId: "other-subcategory" };
    const affected = await profiles.create({
      userId: "owner",
      title: "Perfil afetado",
      description: "",
      contacts: [],
      activityAreas: [area, retained],
    });
    const unrelated = await profiles.create({
      userId: "owner",
      title: "Perfil não afetado",
      description: "",
      contacts: [],
      activityAreas: [retained],
    });

    await profiles.removeActivityArea(area);
    await profiles.removeActivityArea(area);

    await expect(profiles.read({ id: affected })).resolves.toMatchObject({
      activityAreas: [retained],
    });
    await expect(profiles.read({ id: unrelated })).resolves.toMatchObject({
      activityAreas: [retained],
    });
  });
});

describe("activity area advertiser discovery", () => {
  function profilesForDiscovery(records: AdvertiserProfileData[]) {
    return createAdvertiserProfiles({
      now: () => Date.UTC(2026, 8, 10, 3),
      digest: value => value,
      ownsAdImagePath: (adId, path) => path.startsWith(`ad-images/${adId}/`),
      newCorrelationId: () => "profile-delete-test",
      reportImageCleanupSkipped: () => {},
      activityAreaCatalog: { isActive: async () => true },
      store: {
        create: async () => "created",
        update: async () => {},
        classify: async () => {},
        getById: async () => null,
        getByUserId: async () => [],
        getAll: async () => [],
        getByActivityArea: async candidate => records.filter(profile =>
          profile.activityAreas?.some(selected =>
            selected.categoryId === candidate.categoryId
            && selected.subcategoryId === candidate.subcategoryId,
          ),
        ),
        updateActivityAreas: async () => {},
        delete: async () => {},
        deleteClaimable: async () => {},
      },
    });
  }

  function profile(id: string, fields: Partial<AdvertiserProfileData> = {}) {
    return {
      id,
      userId: "same-owner",
      title: `Perfil ${id}`,
      description: "Descrição curta",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [area],
      createdAt: 1,
      updatedAt: 1,
      ...fields,
    } satisfies AdvertiserProfileData;
  }

  test("uses the exact association and excludes profiles without title or contact", async () => {
    const profiles = profilesForDiscovery([
      profile("eligible"),
      profile("wrong-area", { activityAreas: [{ categoryId: "other", subcategoryId: "other" }] }),
      profile("no-title", { title: "   " }),
      profile("no-contact", { contacts: [] }),
    ]);

    await expect(profiles.listForActivityArea(area)).resolves.toEqual([
      expect.objectContaining({ id: "eligible" }),
    ]);
  });

  test("discovers coherent claimable profiles but excludes malformed ownerless records", async () => {
    const { userId: _claimableOwner, ...claimable } = profile("claimable");
    const { userId: _orphanOwner, ...orphan } = profile("orphan");
    const profiles = profilesForDiscovery([
      {
        ...claimable,
        claimable: true,
        source: { url: "https://example.com/profile", checkedAt: 1000 },
      },
      orphan,
    ]);

    await expect(profiles.listForActivityArea(area)).resolves.toEqual([
      expect.objectContaining({ id: "claimable", isClaimable: true }),
    ]);
  });

  test("caps a stable daily rotation at six without deduplicating an owner", async () => {
    const profiles = profilesForDiscovery(
      Array.from({ length: 8 }, (_, index) => profile(`profile-${index}`)),
    );

    const first = await profiles.listForActivityArea({ ...area, civilDate: "2026-09-10" });
    const again = await profiles.listForActivityArea({ ...area, civilDate: "2026-09-10" });

    expect(first).toHaveLength(6);
    expect(first.map(item => item.id)).toEqual(again.map(item => item.id));
    expect(first.every(item => item.id.startsWith("profile-"))).toBe(true);
  });

  test("changes the ranking with the civil date and derives dates in America/Sao_Paulo", async () => {
    const profiles = profilesForDiscovery(
      Array.from({ length: 8 }, (_, index) => profile(`profile-${index}`)),
    );

    const first = await profiles.listForActivityArea({ ...area, civilDate: "2026-09-10" });
    const next = await profiles.listForActivityArea({ ...area, civilDate: "2026-09-11" });

    expect(first.map(item => item.id)).not.toEqual(next.map(item => item.id));
    expect((await import("../profiles")).activityAreaCivilDate(
      Date.UTC(2026, 8, 10, 2, 30),
    )).toBe("2026-09-09");
  });
});
