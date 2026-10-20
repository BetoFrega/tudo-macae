import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";

test.describe("Admin Ads", () => {
  test("Jornada: Filtros e navegação de anúncios", async ({
    adminAdsPage,
    userSidebar,
    adminDashboardPage,
    adminUserCredentials,
    authentication,
    adFixture,
    pausedAdFixture,
    page,
  }) => {
    await test.step("Setup: Login e navegação para página de anúncios", async () => {
      await authentication.login(adminUserCredentials);
      await userSidebar.open();
      await userSidebar.clickAdminPanel();
      await adminDashboardPage.clickViewAds();
      await expect(adminAdsPage.heading).toBeVisible();
    });

    await test.step("Verificar cabeçalhos da tabela de anúncios", async () => {
      await expect.soft(adminAdsPage.adColumnHeader).toBeVisible();
      await expect.soft(adminAdsPage.categoryColumnHeader).toBeVisible();
      await expect.soft(adminAdsPage.subcategoryColumnHeader).toBeVisible();
      await expect.soft(adminAdsPage.createdAtColumnHeader).toBeVisible();
      await expect.soft(adminAdsPage.statusColumnHeader).toBeVisible();
      await expect(
        pageObject(adminAdsPage.page).getByRole("link", { name: adFixture.title }),
      ).toBeVisible();
    });

    await test.step("Verificar botões de filtro disponíveis", async () => {
      await expect.soft(adminAdsPage.allFilterButton).toBeVisible();
      await expect.soft(adminAdsPage.activeFilterButton).toBeVisible();
      await expect.soft(adminAdsPage.pausedFilterButton).toBeVisible();
    });

    await test.step("Visualizar anúncios ativos e pausados", async () => {
      const activeAdRow = adminAdsPage.getAdRow(adFixture.title);
      const pausedAdRow = adminAdsPage.getAdRow(pausedAdFixture.title);

      await expect(activeAdRow).toBeVisible();
      await expect(pausedAdRow).toBeVisible();
      await expect.soft(activeAdRow.getByText("Ativo")).toBeVisible();
      await expect.soft(pausedAdRow.getByText("Pausado")).toBeVisible();
    });

    await test.step("Filtrar apenas anúncios ativos", async () => {
      await click(adminAdsPage.activeFilterButton);
      await expect(adminAdsPage.getAdRow(adFixture.title)).toBeVisible();
      await expect(
        adminAdsPage.getAdRow(pausedAdFixture.title),
      ).not.toBeVisible();
    });

    await test.step("Filtrar apenas anúncios pausados", async () => {
      await click(adminAdsPage.pausedFilterButton);
      await expect(adminAdsPage.getAdRow(adFixture.title)).not.toBeVisible();
      await expect(adminAdsPage.getAdRow(pausedAdFixture.title)).toBeVisible();
    });

    await test.step("Restaurar visualização de todos os anúncios", async () => {
      await click(adminAdsPage.allFilterButton);
      await expect(adminAdsPage.getAdRow(adFixture.title)).toBeVisible();
      await expect(adminAdsPage.getAdRow(pausedAdFixture.title)).toBeVisible();
    });

    await test.step("Navegar para detalhes do anúncio", async () => {
      const adLink = adminAdsPage.getAdLink(adFixture.title);
      await click(adLink);
      await expect(page).toHaveURL(
        `/anuncio/${adFixture.id}/${adFixture.slug}`,
      );
    });
  });
});
