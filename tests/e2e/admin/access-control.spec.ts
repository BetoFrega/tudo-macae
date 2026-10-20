import { expect, test } from "../_helpers/fixtures";

test.describe("Controle de Acesso Admin", () => {
  test("Usuário comum não alcança as rotas administrativas", async ({
    authentication,
    userCredentials,
    adminDashboardPage,
    adminMediaPage,
    userSidebar,
    page,
  }) => {
    await test.step("Setup: Login como usuário comum", async () => {
      await authentication.login(userCredentials);
    });

    await test.step("Verificar que link admin não aparece na sidebar", async () => {
      await userSidebar.open();
      await expect(userSidebar.adminPanelLink).not.toBeVisible();
    });

    const protectedRoutes = [
      "/admin",
      "/admin/anuncios",
      "/admin/categorias",
      "/admin/midias",
      "/admin/perfis",
      "/admin/usuarios",
    ];

    for (const route of protectedRoutes) {
      await test.step(`Bloquear acesso a ${route}`, async () => {
        await page.goto(route);
        await expect(adminDashboardPage.oopsHeading).toBeVisible();
        if (route === "/admin/midias") {
          await expect(adminMediaPage.forbiddenMessage).toBeVisible();
          await expect(adminMediaPage.heading).not.toBeVisible();
        }
        await page.reload();
        await expect(adminDashboardPage.oopsHeading).toBeVisible();
        await expect(adminDashboardPage.forbiddenMessage).toBeVisible();
      });
    }
  });
});
