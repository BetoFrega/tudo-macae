import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";

test("recovers from an unreadable login response and resumes a public ad after HTTP sign-in", async ({ page, userCredentials, categoryFixture, createAdPage }, testInfo) => {
  const requests: Array<{ method: string; pathname: string; hasServerAction: boolean }> = [];
  const documentRequests: string[] = [];
  const title = `Rascunho pós-login ${makeRandomString()}`;
  const text = `Descrição preservada após login ${makeRandomString()}`;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.resourceType() === "document" && request.isNavigationRequest()) documentRequests.push(url.pathname);
    if (request.method() === "POST") {
      requests.push({ method: request.method(), pathname: url.pathname, hasServerAction: Boolean(request.headers()["next-action"]) });
    }
  });
  let loginAttempts = 0;
  await page.route("**/api/autenticacao/entrar", async (route) => {
    loginAttempts += 1;
    if (loginAttempts === 1) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{" });
      return;
    }
    await route.continue();
  });

  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto("/publicar");
  const documentCountBeforeLogin = documentRequests.length;
  await createAdPage.fillTitle(title);
  await createAdPage.selectCategory(categoryFixture.category.name);
  await createAdPage.selectSubcategory(categoryFixture.subcategory.name);
  await createAdPage.fillAdText(text);
  await click(pageObject(page).getByRole("button", { name: "Continuar", exact: true }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("heading", { name: "Entre na sua conta" })).toBeVisible();

  await pageObject(page).getByRole("textbox", { name: "Email" }).fill(userCredentials.email);
  await pageObject(page).getByRole("textbox", { name: "Senha" }).fill(userCredentials.password);
  await click(pageObject(page).getByRole("button", { name: "Entrar", exact: true }));
  await expect(pageObject(page).getByRole("alert").filter({ hasText: "Não foi possível entrar. Tente novamente." }))
    .toHaveText("Não foi possível entrar. Tente novamente.");
  await expect(pageObject(page).getByRole("textbox", { name: "Email" })).toHaveValue(userCredentials.email);
  await expect(pageObject(page).getByRole("textbox", { name: "Senha" })).toHaveValue(userCredentials.password);
  await expect(pageObject(page).getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();

  const desktopCapture = testInfo.outputPath("login-recovery-desktop.png");
  await page.screenshot({ path: desktopCapture, fullPage: false });
  await testInfo.attach("login recovery, desktop, error state", { path: desktopCapture, contentType: "image/png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCapture = testInfo.outputPath("login-recovery-mobile.png");
  await page.screenshot({ path: mobileCapture, fullPage: false });
  await testInfo.attach("login recovery, mobile, error state", { path: mobileCapture, contentType: "image/png" });

  await click(pageObject(page).getByRole("button", { name: "Entrar", exact: true }));
  await expect(pageObject(page).getByRole("button", { name: "Minha conta" })).toBeVisible();
  await expect(pageObject(page).getByRole("dialog")).toHaveCount(0);
  await expect(pageObject(page).getByRole("alert").filter({ hasText: "Não foi possível entrar. Tente novamente." })).toHaveCount(0);
  await expect(page).toHaveURL(/publicar\?publication=/);
  await expect(pageObject(page).getByRole("status").filter({ hasText: "anúncio está salvo" })).toBeVisible();
  await click(pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("textbox", { name: /Título do anúncio/i })).toHaveValue(title);
  await expect(pageObject(page).getByRole("textbox", { name: /Texto do anúncio/i })).toHaveValue(text);

  expect(requests.map(request => request.pathname).filter(pathname => pathname === "/api/autenticacao/entrar" || pathname === "/api/autenticacao/sessao"))
    .toEqual([
      "/api/autenticacao/entrar",
      "/api/autenticacao/entrar",
      "/api/autenticacao/sessao",
    ]);
  const authenticationRequests = requests.filter(request => request.pathname === "/api/autenticacao/entrar" || request.pathname === "/api/autenticacao/sessao");
  expect(authenticationRequests.every(request => !request.hasServerAction)).toBe(true);
  expect(documentRequests).toHaveLength(documentCountBeforeLogin);
});
