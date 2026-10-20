import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { confirmDisposableEmail } from "../../_helpers/auth/helpers/verificationAccounts";
import { expect, test } from "../_helpers/fixtures/readonly-category-test";
import { click } from "../_helpers/click";
import { verifyPublicContentShareReflow } from "../_helpers/verifyPublicContentShareReflow";

// Native verification links must not become trace, screenshot or video artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

// Note: These tests are organized as independent journeys to avoid fixture conflicts
// Each journey tests a complete flow without modifying shared fixtures
test.describe("Ad Status Management", () => {
  test("Jornada: Criação de anúncio e comportamento inicial de status", async ({
    page,
    userCredentials,
    authentication,
    header,
    createAdPage,
    categoryFixture,
    adProfileFixture,
  }, testInfo) => {
    await test.step("Login do usuário", async () => {
      await confirmDisposableEmail(userCredentials.email);
      await authentication.login(userCredentials);
    });

    await test.step("Verificar que toggle de status NÃO aparece na página de criação", async () => {
      await page.goto("/publicar");
      await expect(
        pageObject(page).getByRole("heading", { name: /Publicar anúncio/i }).filter({ visible: true }),
      ).toBeVisible();
      await expect(pageObject(page).getByText("Anúncio Ativo").filter({ visible: true })).not.toBeVisible();
      await expect(pageObject(page).getByRole("switch").filter({ visible: true })).not.toBeVisible();
    });

    await test.step("Publicar novo anúncio e verificar que fica ativo", async () => {
      await header.clickCreateAd();
      const adTitle = "Teste Status Inicial";
      const adText = "Anúncio para testar status inicial";
      await createAdPage.createAd({
        title: adTitle,
        text: adText,
        category: categoryFixture.category.name,
        subcategory: categoryFixture.subcategory.name,
        advertiserProfile: adProfileFixture.title,
      });
      await page.waitForURL(/anuncio\/\w+\/[\w-]+$/);

      await expect(pageObject(page).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
      await expect(pageObject(page).getByText(adText).filter({ visible: true })).toBeVisible();
      await expect(pageObject(page).getByText("Este anúncio está pausado e pode não ter mais validade.")).toHaveCount(0);
      const sharing = pageObject(page).getByRole("region", {
        name: "Compartilhar conteúdo",
        exact: true,
      });
      await expect(sharing).toBeVisible();
      await expect(sharing.getByRole("link", {
        name: "Compartilhar no WhatsApp",
        exact: true,
      }))
        .toHaveAttribute("href", /wa\.me\/\?text=/);
      await verifyPublicContentShareReflow(
        page,
        sharing,
        pageObject(page).getByRole("heading", { name: adTitle }).filter({ visible: true }),
        testInfo,
        "ad",
        false,
      );
    });
  });

  test("Jornada: Gerenciamento de status e visibilidade de anúncios", async ({
    page,
    userCredentials,
    authentication,
    adFixture,
    pausedAdFixture,
    myAdsPage, categoryFixture, storeCategoriesPage,
  }) => {
    await test.step("Login e navegação para Meus Anúncios", async () => {
      await confirmDisposableEmail(userCredentials.email);
      await authentication.login(userCredentials);
    });

    const visibleListingTitle = pageObject(page).getByRole("heading", { name: adFixture.title, level: 3 })
      .filter({ visible: true });

    await test.step("Aquecer a listagem com o anúncio ativo", async () => {
      await storeCategoriesPage.gotoCategory(
        categoryFixture.category.id,
        categoryFixture.category.slug,
      );
      await expect(visibleListingTitle).toBeVisible();
    });

    await myAdsPage.goto();
    await test.step("Verificar ambos anúncios visíveis e testar filtros", async () => {
      const adCard = myAdsPage.card(adFixture.title);
      const pausedAdCard = myAdsPage.card(pausedAdFixture.title);
      await expect(adCard).toBeVisible();
      await expect(pausedAdCard).toBeVisible();

      // Filter active only
      await click(pageObject(page).getByRole("button", { name: /Ativos/ }).filter({ visible: true }));
      await expect(pausedAdCard).not.toBeVisible();

      // Filter paused only
      await click(pageObject(page).getByRole("button", { name: /Pausados/ }).filter({ visible: true }));
      await expect(adCard).not.toBeVisible();
      await expect(pausedAdCard).toBeVisible();
    });

    await test.step("Toggle status de anúncio ativo para pausado", async () => {
      // Go back to all - use page.goto to ensure a fresh load
      await page.goto("/minha-conta/anuncios");

      // Click "Todos" filter to ensure we're showing all ads
      await click(pageObject(page).getByRole("button", { name: /Todos/ }).filter({ visible: true }));

      const adCard = myAdsPage.card(adFixture.title);
      await expect(adCard).toBeVisible({ timeout: 10000 });

      await click(adCard.getByRole("button", { name: "Abrir menu" }));
      await click(pageObject(page).getByRole("menuitem", { name: "Pausar" }).filter({ visible: true }));

      await expect(
        adCard.getByText("Pausado", { exact: true }),
      ).toBeVisible();
      await expect(
        adCard.getByText("Ativo", { exact: true }),
      ).not.toBeVisible();
    });

    await test.step("Observar a listagem atualizada sem limpar o cache", async () => {
    // No cache purge belongs here: preserving the warmed entry proves that the
    // Server Action itself expires the category listing after the mutation.
      await storeCategoriesPage.gotoCategory(
        categoryFixture.category.id,
        categoryFixture.category.slug,
      );
      await expect(visibleListingTitle).not.toBeVisible();
    });

    await test.step("Verificar visibilidade pública - anúncio pausado não aparece", async () => {
      await page.goto("/");
      await expect(pageObject(page).getByText(pausedAdFixture.title).filter({ visible: true })).not.toBeVisible();
    });

    await test.step("Verificar aviso de pausado na página do anúncio", async () => {
      const adUrl = `/anuncio/${pausedAdFixture.id}/${pausedAdFixture.slug}`;
      await page.goto(adUrl);

      await expect(
        pageObject(page).getByText("Este anúncio está pausado e pode não ter mais validade.")
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        pageObject(page).getByText(pausedAdFixture.text).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        pageObject(page).getByRole("region", {
          name: "Compartilhar conteúdo",
          exact: true,
        }),
      ).toHaveCount(0);
    });
  });

  test("Jornada: Alteração de status via página de edição", async ({
    page,
    userCredentials,
    authentication,
    adFixture,
    myAdsPage,
  }) => {
    await test.step("Login e navegação para edição do anúncio", async () => {
      await confirmDisposableEmail(userCredentials.email);
      await authentication.login(userCredentials);
      await myAdsPage.goto();
      await myAdsPage.editAd(adFixture.title);
    });

    await test.step("Verificar toggle de status visível e ativo", async () => {
      await expect(pageObject(page).getByText("Anúncio Ativo").filter({ visible: true })).toBeVisible();
      const statusSwitch = pageObject(page).getByRole("switch").filter({ visible: true });
      await expect(statusSwitch).toBeVisible();
      await expect(statusSwitch).toBeChecked();
    });

    await test.step("Desativar anúncio e salvar", async () => {
      const statusSwitch = pageObject(page).getByRole("switch").filter({ visible: true });
      await click(statusSwitch);
      await expect(statusSwitch).not.toBeChecked();
      await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));
      await page.waitForURL(`/anuncio/${adFixture.id}/${adFixture.slug}`);
    });

    await test.step("Verificar que status mudou em Meus Anúncios", async () => {
      await page.goto("/minha-conta/anuncios");
      const adCard = myAdsPage.card(adFixture.title);
      await expect(adCard.getByText("Pausado")).toBeVisible();
    });
  });
});
