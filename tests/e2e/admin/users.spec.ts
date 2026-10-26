import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";

test.describe("Admin Users", () => {
  test("Jornada: Gerenciamento de privilégios admin", async ({
    adminUsersPage,
    userCredentials,
    anotherAdminUserCredentials,
    adminUserCredentials,
    authentication,
    userSidebar,
    adminDashboardPage,
  }) => {
    await test.step("Setup: Login como admin e navegar para página de usuários", async () => {
      await authentication.login(adminUserCredentials);
      await userSidebar.open();
      await userSidebar.clickAdminPanel();
      await adminDashboardPage.clickViewUsers();
      await expect(adminUsersPage.heading).toBeVisible();
    });

    await test.step("Verificar cabeçalhos da tabela de usuários", async () => {
      await expect.soft(adminUsersPage.emailColumnHeader).toBeVisible();
      await expect.soft(adminUsersPage.nameColumnHeader).toBeVisible();
      await expect.soft(adminUsersPage.createdAtColumnHeader).toBeVisible();
      await expect.soft(adminUsersPage.lastAccessColumnHeader).toBeVisible();
      await expect.soft(adminUsersPage.adminColumnHeader).toBeVisible();
    });

    await test.step("Conceder privilégio admin a usuário comum", async () => {
      const { email: nonAdminUserEmail } = userCredentials;

      const adminGrantButton
        = adminUsersPage.getGrantAdminButton(nonAdminUserEmail);
      await click(adminGrantButton);

      await expect(adminUsersPage.dialog).toBeVisible();
      await expect(adminUsersPage.addAdminDialogTitle).toBeVisible();
      await expect(
        adminUsersPage.dialog.getByText(nonAdminUserEmail),
      ).toBeVisible();

      await click(adminUsersPage.confirmButton);
      await expect(adminUsersPage.dialog).not.toBeVisible();

      const updatedRow = adminUsersPage.getUserRow(nonAdminUserEmail);
      await expect(updatedRow.getByText("Admin")).toBeVisible();
    });

    await test.step("Remover privilégio admin de outro usuário", async () => {
      await userSidebar.open();
      await userSidebar.clickAdminPanel();
      await adminDashboardPage.clickViewUsers();

      const badge = adminUsersPage.getRemoveAdminButton(
        anotherAdminUserCredentials.email,
      );
      await click(badge);

      await expect(adminUsersPage.dialog).toBeVisible();
      await expect(adminUsersPage.removeAdminDialogTitle).toBeVisible();
      await expect(
        adminUsersPage.dialog.getByText(anotherAdminUserCredentials.email),
      ).toBeVisible();

      await click(adminUsersPage.confirmButton);

      await expect(adminUsersPage.dialog).not.toBeVisible();
      const updatedRow = adminUsersPage.getUserRow(
        anotherAdminUserCredentials.email,
      );
      await expect(updatedRow.getByText("Usuário")).toBeVisible();
    });
  });
});
