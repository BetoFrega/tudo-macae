import { describe, expect, test } from "vitest";
import { fixture, foodArea, healthArea, profile } from "./businessCatalogFixtures";

describe("business catalog category browsing", () => {
  test("lists a category through active business activity areas", async () => {
    const { catalog } = fixture([
      profile("cafe", "Café com Arte"),
      profile("clinic", "Clínica Central", { activityAreas: [healthArea] }),
      profile("mixed", "Espaço Misto", { activityAreas: [foodArea, healthArea] }),
    ]);

    await expect(catalog.list({ categoryId: "food" })).resolves.toMatchObject({
      items: [
        { id: "cafe" },
        { id: "mixed" },
      ],
    });
  });

  test("previews six unique category businesses with stable daily rotation", async () => {
    const records = Array.from({ length: 8 }, (_, index) =>
      profile(`food-${index}`, `Negócio ${index}`, {
        activityAreas: index === 0
          ? [
              foodArea,
              { categoryId: "food", subcategoryId: "meals" },
              healthArea,
            ]
          : [foodArea],
      }));
    const { catalog } = fixture([
      ...records,
      profile("health", "Clínica", { activityAreas: [healthArea] }),
      profile("inactive", "Inativo", {
        activityAreas: [{ categoryId: "food", subcategoryId: "inactive" }],
      }),
    ]);

    const first = await catalog.previewCategory({
      categoryId: "food",
      civilDate: "2026-09-20",
    });
    const repeated = await catalog.previewCategory({
      categoryId: "food",
      civilDate: "2026-09-20",
    });
    const nextDay = await catalog.previewCategory({
      categoryId: "food",
      civilDate: "2026-09-21",
    });

    expect(first).toHaveLength(6);
    expect(first.map(business => business.id)).toEqual(
      repeated.map(business => business.id),
    );
    expect(nextDay.map(business => business.id)).not.toEqual(
      first.map(business => business.id),
    );
    expect(new Set(first.map(business => business.id)).size).toBe(6);
    expect(first).not.toContainEqual(expect.objectContaining({ id: "health" }));
    expect(first).not.toContainEqual(expect.objectContaining({ id: "inactive" }));
  });

  test("continues through candidate pages to find category businesses", async () => {
    const earlierCandidates = Array.from({ length: 50 }, (_, index) =>
      profile(
        `health-${String(index).padStart(2, "0")}`,
        `Clínica ${String(index).padStart(2, "0")}`,
        { activityAreas: [healthArea] },
      ));
    const { catalog, calls } = fixture([
      ...earlierCandidates,
      profile("late-food", "Zênite Alimentos"),
    ]);

    await expect(catalog.previewCategory({
      categoryId: "food",
      civilDate: "2026-09-20",
    })).resolves.toMatchObject([{ id: "late-food" }]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(expect.objectContaining({
      after: expect.objectContaining({ id: "health-49" }),
      limit: 50,
    }));
  });

  test.each([
    { categoryId: " ", civilDate: "2026-09-20" },
    { categoryId: "food", civilDate: "20/09/2026" },
  ])("rejects invalid category preview input", async (input) => {
    const { catalog } = fixture([]);

    await expect(catalog.previewCategory(input)).rejects.toThrow(
      "Categoria ou data civil inválida para o preview de Negócios.",
    );
  });
});
