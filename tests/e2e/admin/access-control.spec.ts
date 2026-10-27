import { expect, test } from "../_helpers/fixtures";

// One refusal proves the session reaches the admin gate before private data renders;
// the gate's role variants are in src/app/admin/layout.test.tsx.
test("Usuário comum é recusado no acervo de mídia antes de ver os dados", async ({
  authentication,
  userCredentials,
  adminDashboardPage,
  adminMediaPage,
  page,
}) => {
  await authentication.login(userCredentials);
  await page.goto("/admin/midias");
  await expect(adminDashboardPage.oopsHeading).toBeVisible();
  await expect(adminMediaPage.forbiddenMessage).toBeVisible();
  await expect(adminMediaPage.heading).not.toBeVisible();
});
