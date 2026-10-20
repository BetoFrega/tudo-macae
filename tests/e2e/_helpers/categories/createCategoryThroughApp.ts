import { expect, type Browser, type BrowserContext } from "@playwright/test";
import { fixtureCategoryCatalog, deleteCategoryFixture } from "./fixtureStore";
import { playwrightTarget } from "../../../../bin/playwrightTarget";
import { AdminCategoriesPage } from "../admin/POMs/AdminCategoriesPage";
import { AdminDashboardPage } from "../admin/POMs/AdminDashboardPage";
import { deleteUser, loginUser, registerTestUser } from "../auth/helpers/authentication";
import { UserSidebar } from "../fixtures/POMs/UserSidebar";
import type { CategorySubcategoryFixture } from "./categories-test-utils";

/** Normal admin actions invalidate the deployed catalogue; no test route is exposed. */
export async function createCategoryThroughApp(
  browser: Browser,
  category: Omit<CategorySubcategoryFixture["category"], "id">,
  subcategory: Omit<CategorySubcategoryFixture["subcategory"], "id">,
) {
  if ((await fixtureCategoryCatalog()).some(existing => existing.slug === category.slug)) throw new Error("Slug da fixture já existe.");
  const administrator = await registerTestUser({ claims: { admin: true } });
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({ baseURL: playwrightTarget().origin });
    const page = await context.newPage();
    await loginUser(page, administrator);
    const sidebar = new UserSidebar(page);
    const categories = new AdminCategoriesPage(page, sidebar, new AdminDashboardPage(page, sidebar));
    await categories.goto();
    await categories.clickNewCategory();
    await categories.fillCategoryName(category.name);
    await categories.fillCategorySlug(category.slug);
    await categories.fillCategoryOrder(String(category.order));
    await categories.submitCategory();
    await expect(categories.getCategoryHeading(category.name)).toBeVisible();
    await categories.clickEditCategory(category.name);
    await categories.clickNewSubcategory();
    await categories.fillSubcategoryName(subcategory.name);
    await categories.fillSubcategorySlug(subcategory.slug);
    await categories.fillSubcategoryOrder(String(subcategory.order));
    await categories.saveSubcategory();
    await expect(categories.getSubcategoryInList(subcategory.name)).toBeVisible();
    const created = (await fixtureCategoryCatalog()).find(item => item.slug === category.slug);
    const child = created?.subcategories.find(item => item.slug === subcategory.slug);
    const resolved = created && child ? { categoryId: created.id, subcategoryId: child.id } : null;
    if (!resolved) throw new Error("Created category fixture could not be resolved.");
    return resolved;
  }
  catch (error) {
    const ownCategory = (await fixtureCategoryCatalog()).find(existing => existing.slug === category.slug && existing.name === category.name);
    if (ownCategory) await deleteCategoryFixture({ id: ownCategory.id });
    throw error;
  }
  finally {
    try {
      await context?.close();
    }
    finally { await deleteUser(administrator.uid); }
  }
}
