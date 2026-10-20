import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect } from "@playwright/test";
import { test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";

// Run with node tests/_helpers/offering-catalog-runner.mjs test:e2e -- <spec>.
test("owner prepares, administrator enables and revokes, visitor cannot bypass controls", async ({ page, browser, request, authentication, userCredentials, adminUserCredentials, adProfileFixture }, testInfo) => {
  const businessId = adProfileFixture.id;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!host?.startsWith("https://localhost:")) throw new Error("Run with the offering catalog HTTPS provider fixture.");
  const release = async (decision: string) => {
    await request.post(`${host}/control`, { data: { businessId, decision } });
  };
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const publicPage = await visitor.newPage();
  const management = `/minha-conta/negocios/${businessId}/catalogo`;
  try {
    await release("enabled");
    const canonical = businessCanonicalPath(adProfileFixture);
    await authentication.login(userCredentials);
    await page.goto(management);
    await expect(pageObject(page).getByText("Catálogo não habilitado pelo administrador.", { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-owner-empty-desktop.png"), fullPage: true });
    await pageObject(page).getByLabel("Nome do item", { exact: true }).fill("Consulta inicial");
    await pageObject(page).getByLabel("Descrição (opcional)", { exact: true }).fill("Conversa inicial para entender suas necessidades e orientar os próximos passos.");
    await pageObject(page).getByLabel("Modalidade de preço", { exact: true }).selectOption("from");
    await pageObject(page).getByLabel("Valor em reais", { exact: true }).fill("12,34");
    const create = pageObject(page).getByRole("button", { name: "Cadastrar item oculto", exact: true });
    await create.focus();
    await create.press("Enter");
    await expect(pageObject(page).getByRole("status")).toHaveText("Item salvo.");
    await expect(pageObject(page).getByRole("status")).toBeFocused();
    await expect(pageObject(page).getByLabel("Nome do item", { exact: true })).toHaveValue("");
    await expect(pageObject(page).getByLabel("Modalidade de preço", { exact: true })).toHaveValue("on_request");
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-created-focus-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-created-focus-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    const item = pageObject(page).getByRole("article").filter({ has: pageObject(page).getByRole("heading", { name: "Consulta inicial", exact: true }) });
    await expect(item.getByText("Item oculto", { exact: true })).toBeVisible();
    await click(item.getByRole("button", { name: "Exibir item", exact: true }));
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-owner-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-owner-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await publicPage.goto(`${canonical}#catalogo`);
    await expect(pageObject(publicPage).getByRole("heading", { name: "Consulta inicial", exact: true })).toHaveCount(0);
    expect((await request.get(`/api/negocios/${businessId}/catalogo`)).status()).toBe(404);
    await authentication.login(adminUserCredentials);
    await page.goto(management);
    await click(pageObject(page).getByRole("button", { name: "Habilitar exibição do catálogo", exact: true }));
    await expect(pageObject(page).getByText("Catálogo habilitado pelo administrador.", { exact: true })).toBeVisible();
    await click(item.getByRole("button", { name: "Ocultar item", exact: true }));
    await publicPage.reload();
    await expect(pageObject(publicPage).getByRole("heading", { name: "Catálogo do negócio", exact: true })).toHaveCount(0);
    expect((await request.get(`/api/negocios/${businessId}/catalogo`)).status()).toBe(404);
    await publicPage.screenshot({ path: testInfo.outputPath("offering-catalog-no-visible-items-mobile.png"), fullPage: true });
    await publicPage.setViewportSize({ width: 1280, height: 900 });
    await publicPage.screenshot({ path: testInfo.outputPath("offering-catalog-no-visible-items-desktop.png"), fullPage: true });
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await click(item.getByRole("button", { name: "Exibir item", exact: true }));
    await publicPage.reload();
    await expect(pageObject(publicPage).getByRole("heading", { name: "Consulta inicial", exact: true })).toBeVisible();
    await expect(pageObject(publicPage).getByText("A partir de R$ 12,34", { exact: true })).toBeVisible();
    const response = await request.get(`/api/negocios/${businessId}/catalogo`);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ items: [{ id: expect.any(String), name: "Consulta inicial", description: "Conversa inicial para entender suas necessidades e orientar os próximos passos.", price: { mode: "from", cents: 1234 } }] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-management-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await publicPage.screenshot({ path: testInfo.outputPath("offering-catalog-public-mobile.png"), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-management.png"), fullPage: true });
    await publicPage.setViewportSize({ width: 1280, height: 900 });
    await publicPage.screenshot({ path: testInfo.outputPath("offering-catalog-public-desktop.png"), fullPage: true });
    await click(pageObject(page).getByRole("button", { name: "Revogar exibição do catálogo", exact: true }));
    await expect(pageObject(publicPage).getByRole("heading", { name: "Consulta inicial", exact: true })).toHaveCount(0, { timeout: 20000 });
    expect((await request.get(`/api/negocios/${businessId}/catalogo`)).status()).toBe(404);
    await authentication.login(userCredentials);
    await page.goto(management);
    const retained = pageObject(page).getByRole("article");
    const edit = retained.getByText("Editar item", { exact: false });
    await edit.focus();
    await expect(edit).toBeFocused();
    await edit.press("Enter");
    await expect(retained.getByRole("button", { name: "Salvar item", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-owner-editor-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("offering-catalog-owner-editor-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await retained.getByLabel("Nome do item", { exact: true }).fill("Consulta atualizada");
    await click(retained.getByRole("button", { name: "Salvar item", exact: true }));
    await expect(retained.getByRole("heading", { name: "Consulta atualizada", exact: true })).toBeVisible();
    await authentication.login(adminUserCredentials);
    await page.goto(management);
    await click(pageObject(page).getByRole("button", { name: "Habilitar exibição do catálogo", exact: true }));
    await publicPage.reload();
    await expect(pageObject(publicPage).getByRole("heading", { name: "Consulta atualizada", exact: true })).toBeVisible();
    await release("disabled");
    await expect(pageObject(publicPage).getByRole("heading", { name: "Consulta atualizada", exact: true })).toHaveCount(0, { timeout: 20000 });
    for (const decision of ["disabled", "outside_audience", "unavailable"]) {
      await release(decision);
      await publicPage.goto(`${canonical}#catalogo`);
      await expect(pageObject(publicPage).getByRole("heading", { name: "Catálogo do negócio", exact: true })).toHaveCount(0);
      expect((await request.get(`/api/negocios/${businessId}/catalogo`)).status()).toBe(404);
      await page.goto(management);
      await expect(pageObject(page).getByRole("heading", { name: "Catálogo do negócio", exact: true })).toHaveCount(0);
    }
  }
  finally {
    await visitor.close();
  }
});

for (const actor of ["owner", "administrator"] as const) {
  test(`profile editing streams while the catalog flag is pending for ${actor}`, async ({ page, request, authentication, userCredentials, adminUserCredentials, adProfileFixture, profilePage, adminProfilesPage }) => {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!host?.startsWith("https://localhost:")) throw new Error("Run with the offering catalog HTTPS provider fixture.");
    await authentication.login(actor === "owner" ? userCredentials : adminUserCredentials);
    await request.post(`${host}/control`, { data: { businessId: adProfileFixture.id, decision: "slow" } });
    const route = actor === "owner" ? `/minha-conta/perfis/${adProfileFixture.id}/editar` : `/admin/perfis/${adProfileFixture.id}`;
    await page.goto(route, { waitUntil: "commit" });
    const title = actor === "owner" ? profilePage.titleInput : adminProfilesPage.titleInput;
    await expect(title).toBeVisible();
    await expect(title).toHaveValue(adProfileFixture.title);
    const evaluation = await request.post(`${host}/control`, { data: { businessId: adProfileFixture.id } });
    expect(await evaluation.json()).toEqual({ pending: true });
    await page.screenshot({ path: `test-results/offering-catalog-edit-${actor}-pending-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/offering-catalog-edit-${actor}-pending-mobile.png`, fullPage: true });
    await page.waitForLoadState("load");
    await expect(pageObject(page).getByRole("link", { name: "Gerenciar catálogo do negócio", exact: true })).toHaveCount(0);
  });
}
