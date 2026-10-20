import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { click } from "../_helpers/click";

// Note: Access control for non-admin users is covered in access-control.spec.ts
test.describe("Admin Categories", () => {
  test("Jornada: Gerenciamento completo de categorias", async ({
    adminCategoriesPage,
    adminUserCredentials,
    authentication,
  }) => {
    const randomString = makeRandomString();
    const categoryName = `Test Category - ${randomString}`;
    const categorySlug = `test-category-${randomString}`;
    const subcategoryName = `Test Sub - ${randomString}`;
    const subcategorySlug = `test-sub-${randomString}`;

    await test.step("Login como admin e acessar página de categorias", async () => {
      await authentication.login(adminUserCredentials);
      await adminCategoriesPage.goto();
    });

    await test.step("Criar nova categoria", async () => {
      await adminCategoriesPage.clickNewCategory();
      await adminCategoriesPage.fillCategoryName(categoryName);
      await adminCategoriesPage.fillCategorySlug(categorySlug);
      await adminCategoriesPage.fillCategoryOrder("-1.5");
      await pageObject(adminCategoriesPage.page).getByLabel("Ordem em Negócios").fill("3.5");
      await pageObject(adminCategoriesPage.page).getByLabel("Primeira camada pública").selectOption("businesses");
      await adminCategoriesPage.fillCategoryIcon("star");
      await adminCategoriesPage.submitCategory();
      await expect(
        adminCategoriesPage.getCategoryHeading(categoryName),
      ).toBeVisible();

      // Verify persistence by going back to edit
      await adminCategoriesPage.clickEditCategory(categoryName);
      await expect(adminCategoriesPage.categoryIconField).toHaveValue("star");
      await expect(pageObject(adminCategoriesPage.page).getByLabel("Ordem em Negócios")).toHaveValue("3.5");
      await expect(pageObject(adminCategoriesPage.page).getByLabel("Primeira camada pública")).toHaveValue("businesses");
      await pageObject(adminCategoriesPage.page).getByLabel("Ordem em Negócios").fill("");
      await pageObject(adminCategoriesPage.page).getByLabel("Primeira camada pública").selectOption("");
      await click(pageObject(adminCategoriesPage.page).getByRole("button", { name: "Salvar Alterações" }));
      await adminCategoriesPage.clickEditCategory(categoryName);
      await adminCategoriesPage.page.reload();
      await expect(pageObject(adminCategoriesPage.page).getByLabel("Ordem em Negócios")).toHaveValue("");
      await expect(pageObject(adminCategoriesPage.page).getByLabel("Primeira camada pública")).toHaveValue("");
      await adminCategoriesPage.goto(); // Go back to list for next steps
    });

    await test.step("Adicionar subcategoria à categoria criada", async () => {
      await adminCategoriesPage.clickEditCategory(categoryName);
      await adminCategoriesPage.clickNewSubcategory();
      await adminCategoriesPage.fillSubcategoryName(subcategoryName);
      await adminCategoriesPage.fillSubcategorySlug(subcategorySlug);
      await adminCategoriesPage.fillSubcategoryOrder("0.25");
      await adminCategoriesPage.saveSubcategory();
      await expect(
        adminCategoriesPage.getSubcategoryInList(subcategoryName),
      ).toBeVisible();
    });

    await test.step("Verificar links de visualização pública no admin", async () => {
      await adminCategoriesPage.goto();

      // Click category name link - opens in same tab
      await adminCategoriesPage.clickCategoryName(categoryName);

      // Verify public category page loaded
      await expect(
        pageObject(adminCategoriesPage.page).getByRole("heading", {
          name: categoryName,
          level: 1,
        }),
      ).toBeVisible();

      // Go back to admin
      await adminCategoriesPage.goto();

      // Navigate to Edit Category to see subcategories list (as per test flow)
      await adminCategoriesPage.clickEditCategory(categoryName);

      // Click subcategory view link - opens in same tab
      await adminCategoriesPage.clickSubcategoryName(subcategoryName);

      // Verify public subcategory page loaded
      await expect(
        pageObject(adminCategoriesPage.page).getByRole("heading", {
          name: subcategoryName,
          level: 1,
        }),
      ).toBeVisible();
    });
  });
});
