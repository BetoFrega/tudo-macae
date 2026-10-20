import { pageObject } from "./_helpers/fixtures/POMs/pageObject";
import { expect, test } from "@playwright/test";
import { AdminCategoriesPage } from "./_helpers/admin/POMs/AdminCategoriesPage";
import { AdminDashboardPage } from "./_helpers/admin/POMs/AdminDashboardPage";
import { UserSidebar } from "./_helpers/fixtures/POMs/UserSidebar";
import { EditAdPage } from "./_helpers/ads/POMs/EditAdPage";

test("Salvar anúncio espera a navegação confirmada após resposta do servidor", async ({ page }) => {
  await page.route("**/anuncio/fixture/editar", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<button onclick="setTimeout(() => { location.href = '/anuncio/fixture/salvo'; }, 300)">Salvar Alterações</button>`,
  }));
  await page.route("**/anuncio/fixture/salvo", route => route.fulfill({ body: "Salvo" }));
  await page.goto("/anuncio/fixture/editar");
  await new EditAdPage(page).saveChanges();
  expect(new URL(page.url()).pathname).toBe("/anuncio/fixture/salvo");
});

test("Salvar subcategoria espera o formulário fechar após confirmação do servidor", async ({ page }) => {
  await page.setContent(`<button aria-label="Salvar" onclick="setTimeout(() => { this.remove(); document.body.dataset.saved = 'yes'; }, 300)">Salvar</button>`);
  const sidebar = new UserSidebar(page);
  const categories = new AdminCategoriesPage(page, sidebar, new AdminDashboardPage(page, sidebar));
  await categories.saveSubcategory();
  expect(await pageObject(page).locator("body").filter({ visible: true }).getAttribute("data-saved")).toBe("yes");
});
