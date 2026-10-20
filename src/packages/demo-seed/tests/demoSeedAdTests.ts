import { expect, test } from "vitest";
import { categoryCatalog, seededAds, seededProfiles } from "./demoSeedFixture";

export function registerAdTests() {
  test("points every seeded ad at a profile and a subcategory that really exist", async () => {
    const [ads, profiles, categories] = await Promise.all([seededAds(), seededProfiles(), categoryCatalog()]);
    const ownerByProfileId = new Map(profiles.map(profile => [profile.id, profile.userId]));
    const subcategoryIds = new Set(categories.flatMap(category =>
      category.subcategories.map(subcategory => `${category.id}/${subcategory.id}`)));

    for (const ad of ads) {
      expect(ownerByProfileId.get(ad.advertiserProfileId)).toBe(ad.userId);
      expect(subcategoryIds.has(`${ad.categoryId}/${ad.subcategoryId}`)).toBe(true);
    }
  });

  test("covers both active and paused ads", async () => {
    const ads = await seededAds();
    const statuses = new Set(ads.map(ad => ad.status));

    expect(statuses).toEqual(new Set(["active", "paused"]));
  });

  test("never repeats a title between ads", async () => {
    const ads = await seededAds();
    const titles = ads.map(ad => ad.title);

    expect(new Set(titles).size).toBe(titles.length);
  });

  test("leaves at least one subcategory without an ad", async () => {
    const category = (await categoryCatalog()).find(candidate => candidate.slug === "imoveis")!;
    const subcategory = category.subcategories.find(candidate => candidate.slug === "comercial")!;

    const ads = await seededAds();

    expect(ads.filter(ad => ad.subcategoryId === subcategory.id)).toHaveLength(0);
  });
}
