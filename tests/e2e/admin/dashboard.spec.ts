import { expect, test } from "../_helpers/fixtures";

test.describe("Admin Dashboard", () => {
  test("Jornada: Acesso e navegação do dashboard admin", async ({
    userWithClaims,
    userSidebar,
    adminDashboardPage,
    page,
  }) => {
    await test.step("Acessar dashboard admin via sidebar", async () => {
      await userWithClaims({ admin: true });
      await page.goto("/admin");
      await expect(adminDashboardPage.heading).toBeVisible();
      await userSidebar.open();
      await expect(userSidebar.adminPanelLink).toBeVisible();
      await userSidebar.clickAdminPanel();

      await expect(page).toHaveURL("/admin");
      await expect(adminDashboardPage.heading).toBeVisible();
    });

    await test.step("Navegar para gerenciamento de categorias", async () => {
      await adminDashboardPage.clickManageCategories();
      await expect(page).toHaveURL("/admin/categorias");
    });
  });
});
