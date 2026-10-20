import { describe, expect, test } from "vitest";
import { fixture, foodArea, healthArea, profile } from "./businessCatalogFixtures";

describe("business catalog reads and readiness", () => {
  test("enumerates represented areas through bounded sequential pages", async () => {
    const records = Array.from({ length: 101 }, (_, index) =>
      profile(`id-${index}`, `Negócio ${index}`, {
        activityAreas: index === 100 ? [healthArea] : [foodArea],
      }));
    const { catalog, calls } = fixture(records);

    await expect(catalog.listRepresentedActivityAreas()).resolves.toEqual([
      foodArea,
      healthArea,
    ]);
    expect(calls).toHaveLength(3);
    expect(calls).toEqual([
      expect.objectContaining({ limit: 50 }),
      expect.objectContaining({ limit: 50 }),
      expect.objectContaining({ limit: 50 }),
    ]);
  });

  test("reads only a catalog-eligible business", async () => {
    const { catalog } = fixture([
      profile("eligible", "Elegível", { activityAreas: [foodArea, healthArea] }),
      profile("inactive", "Inativo", {
        activityAreas: [{ categoryId: "food", subcategoryId: "inactive" }],
      }),
    ]);

    await expect(catalog.read({ id: "eligible" })).resolves.toMatchObject({
      id: "eligible",
      activityAreas: [foodArea, healthArea],
    });
    await expect(catalog.read({ id: "inactive" })).resolves.toBeNull();
    await expect(catalog.read({ id: "missing" })).resolves.toBeNull();
  });

  test("explains readiness using the same eligibility as the public read", async () => {
    const draft = profile("draft", "Rascunho", { contacts: [], activityAreas: [] });
    const { catalog } = fixture([draft]);

    await expect(catalog.assess(draft)).resolves.toEqual({
      business: null,
      missing: ["contact", "activityArea"],
    });
    draft.contacts = [{ number: "22999999999", isWhatsapp: true }];
    draft.activityAreas = [foodArea];
    await expect(catalog.assess(draft)).resolves.toMatchObject({
      business: { id: "draft" },
      missing: [],
    });
    await expect(catalog.read({ id: "draft" })).resolves.toMatchObject({ id: "draft" });
    draft.activityAreas = [{ categoryId: "food", subcategoryId: "inactive" }];
    await expect(catalog.assess(draft)).resolves.toEqual({
      business: null,
      missing: ["activityArea"],
    });
    await expect(catalog.read({ id: "draft" })).resolves.toBeNull();
  });

  test("checks a shared activity area once when assessing the owner's list", async () => {
    let checks = 0;
    const { catalog } = fixture([
      profile("first", "Primeiro"),
      profile("second", "Segundo"),
    ], async () => {
      checks += 1;
      return true;
    });

    const readiness = await catalog.assessMany([
      profile("first", "Primeiro"),
      profile("second", "Segundo"),
    ]);

    expect(readiness.every(item => item.business !== null)).toBe(true);
    expect(checks).toBe(1);
  });
});
