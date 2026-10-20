import { expect, test } from "vitest";
import { asAdmin, categoryCatalog, demo, INITIAL_CATEGORY_SLUGS, seededProfiles } from "./demoSeedFixture";

export function registerCategoryTests() {
  test("reports what it seeded once the environment allows it", () => {
    expect(demo.firstRun.seeded).toBe(true);
    // Owned and public-information businesses share the catalog, but only the
    // owned records require demo accounts.
    expect(demo.firstRun.accounts).toBeGreaterThanOrEqual(10);
    expect(demo.firstRun.businesses).toBeGreaterThan(demo.firstRun.accounts);
    expect(demo.firstRun.ads).toBeGreaterThan(0);
  });

  test("seeds the category catalogue the rest of the mass points into", async () => {
    const categories = await categoryCatalog();

    expect(categories.length).toBeGreaterThan(0);
    expect(categories.find(category => category.id === demo.unrelatedCategoryId)?.isActive).toBe(true);
    expect(categories.filter(category => INITIAL_CATEGORY_SLUGS.has(category.slug) && category.isActive)).toHaveLength(11);
  });

  test("makes every active seeded category visible through eligible businesses", async () => {
    const [categories, page, profiles] = await Promise.all([
      categoryCatalog(),
      (await asAdmin()).read<{ items: { activityAreas: { categoryId: string }[] }[] }>("business.list", { limit: 50 }),
      seededProfiles(),
    ]);
    const representedCategoryIds = new Set(
      page.items.flatMap(business =>
        business.activityAreas.map(area => area.categoryId)),
    );

    expect(categories
      .filter(category => INITIAL_CATEGORY_SLUGS.has(category.slug) && category.isActive)
      .every(category => representedCategoryIds.has(category.id))).toBe(true);
    expect(profiles.some(profile =>
      profile.claimable === true
      && profile.userId === undefined
      && typeof profile.source?.url === "string")).toBe(true);
  });
}
