import type { Browser } from "@playwright/test";
import { test as base, expect } from "./index";
import { createCategoryThroughApp } from "../categories/createCategoryThroughApp";
import type { CategorySubcategoryFixture } from "../categories/categories-test-utils";
import { deleteCategoryFixture } from "../categories/fixtureStore";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { makeRandomString } from "../../../_helpers/makeRandomString";

type ReadonlyCategory = {
  readonly category: Readonly<CategorySubcategoryFixture["category"]>;
  readonly subcategory: Readonly<CategorySubcategoryFixture["subcategory"]>;
};
type SharedCategory = { get: (browser: Browser) => Promise<ReadonlyCategory> };

// Opt in only when the journey leaves categories unchanged. Ads, profiles and
// users remain test scoped; category cleanup follows their fixture teardown.
export const test = base.extend<{ categoryFixture: ReadonlyCategory }, { sharedCategory: SharedCategory }>({
  sharedCategory: [async ({}, use) => {
    let fixture: ReadonlyCategory | undefined;
    try {
      await use({ get: async (browser) => {
        if (!fixture) {
          const suffix = makeRandomString();
          const categoryName = `Categoria de teste ${suffix}`;
          const subcategoryName = `Subcategoria de teste ${suffix}`;
          const category = { name: categoryName, slug: slugify(categoryName), order: 1, isActive: true };
          const subcategory = { name: subcategoryName, slug: slugify(subcategoryName), order: 1, isActive: true };
          const { categoryId, subcategoryId } = await createCategoryThroughApp(browser, category, subcategory);
          fixture = Object.freeze({
            category: Object.freeze({ id: categoryId, ...category }),
            subcategory: Object.freeze({ id: subcategoryId, ...subcategory }),
          });
        }
        return fixture;
      } });
    }
    finally {
      if (fixture) await deleteCategoryFixture({ id: fixture.category.id });
    }
  }, { scope: "worker" }],
  categoryFixture: async ({ browser, sharedCategory }, use) => {
    await use(await sharedCategory.get(browser));
  },
});

export { expect };
