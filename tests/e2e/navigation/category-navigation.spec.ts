import { expect, test } from "../_helpers/fixtures";

test.describe("Category Navigation", () => {
  test("navigates through the shared header and direct SEO routes", async ({
    page,
    categoryFixture,
    storeCategoriesPage,
  }) => {
    const { category, subcategory } = categoryFixture;

    await test.step("Navigate to Category via Header (Desktop)", async () => {
      await page.goto("/");
      await storeCategoriesPage.clickHeaderCategory(category.name);
      await expect(storeCategoriesPage.getHeading(category.name)).toBeVisible();
    });

    await test.step("Navigate to Category via Homepage", async () => {
      await page.goto("/");
      // Scroll to nav if needed (playwright handles auto-scroll usually)
      await storeCategoriesPage.clickHomepageCategory(category.name);

      await expect(storeCategoriesPage.getHeading(category.name)).toBeVisible();
    });

    await test.step("Direct access to SEO URL", async () => {
      await storeCategoriesPage.gotoCategory(category.id, category.slug);
      await expect(storeCategoriesPage.getHeading(category.name)).toBeVisible();
      await expect(
        storeCategoriesPage.getEmptyStateHeading(category.name),
      ).toBeVisible();
      await expect(storeCategoriesPage.getPublishAdLink()).toHaveAttribute(
        "href",
        "/publicar",
      );
    });

    await test.step("Direct access to Subcategory SEO URL", async () => {
      await storeCategoriesPage.gotoSubcategory(
        category.id,
        category.slug,
        subcategory.id,
        subcategory.slug,
      );
      await expect(
        storeCategoriesPage.getHeading(subcategory.name),
      ).toBeVisible();
    });
  });
});
