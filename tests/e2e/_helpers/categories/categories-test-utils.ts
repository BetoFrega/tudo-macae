import test from "@playwright/test";
import { createCategoryThroughApp } from "./createCategoryThroughApp";
import { deleteCategoryFixture } from "./fixtureStore";
import { makeRandomString } from "../../../_helpers/makeRandomString";
import { StoreCategoriesPage } from "./POMs/StoreCategoriesPage";

export type CategorySubcategoryFixture = {
  category: {
    id: string;
    name: string;
    slug: string;
    order: number;
    isActive: boolean;
  };
  subcategory: {
    id: string;
    name: string;
    slug: string;
    order: number;
    isActive: boolean;
  };
};

export const categoriesTest = test.extend<{
  // fixtures
  categoryFixture: CategorySubcategoryFixture;
  // POMs
  storeCategoriesPage: StoreCategoriesPage;
}>({
  // fixtures
  categoryFixture: async ({ browser }, use) => {
    const randomSuffix = makeRandomString();
    const category = {
      name: `Test Category - ${randomSuffix}`,
      slug: `test-category-${randomSuffix}`,
      order: 1,
      isActive: true,
    };
    const subcategory = {
      name: `Test Subcategory - ${randomSuffix}`,
      slug: `test-subcategory-${randomSuffix}`,
      order: 1,
      isActive: true,
    };

    const { categoryId, subcategoryId } = await createCategoryThroughApp(browser, category, subcategory);

    await use({
      category: { id: categoryId, ...category },
      subcategory: { id: subcategoryId, ...subcategory },
    });

    await deleteCategoryFixture({ id: categoryId });
  },

  storeCategoriesPage: async ({ page }, use) => {
    await use(new StoreCategoriesPage(page));
  },
});
