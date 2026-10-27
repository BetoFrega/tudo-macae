import { workerFixture } from "../../_helpers/auth/helpers/workerFixture";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";

test.describe("My Ads", () => {
  test("Usuário não autenticado vê componente Unauthorized", async ({
    page,
  }) => {
    await page.goto("/minha-conta/anuncios");
    await expect(
      pageObject(page).getByText("Você precisa se autenticar para ver essa página.").filter({ visible: true }),
    ).toBeVisible();
    await expect(
      pageObject(page).getByRole("button", { name: "Fazer login" }).filter({ visible: true }),
    ).toBeVisible();
    /* eslint-disable local/no-positional-playwright-locators, local/no-raw-playwright-page-selectors -- Root and route metadata are non-visible and coexist; either robots directive proves this protected response is not indexable. */
    await expect(page.locator("meta[name=\"robots\"]").first()).toHaveAttribute("content", /noindex/);
    /* eslint-enable local/no-positional-playwright-locators, local/no-raw-playwright-page-selectors */
  });
});

test("Titular atual administra o anúncio da identidade transferida", async ({ page, adFixture, anotherUserCredentials, authentication, myAdsPage, editAdPage }) => {
  await workerFixture("/set-profile-owner", { id: adFixture.advertiserProfileId, uid: anotherUserCredentials.uid });
  await workerFixture("/verify", { email: anotherUserCredentials.email, emailVerified: true });
  await authentication.login(anotherUserCredentials);
  await page.goto("/minha-conta/anuncios");
  await expect(myAdsPage.card(adFixture.title)).toBeVisible();
  await myAdsPage.pauseAd(adFixture.title);
  await myAdsPage.activateAd(adFixture.title);
  await myAdsPage.editAd(adFixture.title);
  await editAdPage.fillAdText("Conteúdo atualizado pelo titular atual da identidade");
  await editAdPage.saveChanges();
  await expect(pageObject(page).getByText("Conteúdo atualizado pelo titular atual da identidade", { exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("link", { name: "Editar Anúncio", exact: true })).toBeVisible();
  await test.step("No celular, o aviso de permissão indisponível fica abaixo da descrição", async () => {
    // Kept in the browser because no happy path renders the permission notice and only layout proves its placement;
    // its states and retry are covered by useAdManagementPermission.test.tsx.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes(adFixture.id)) {
        await route.abort("failed");
      }
      else {
        await route.continue();
      }
    });
    try {
      await page.reload();
      const status = pageObject(page).getByRole("status").filter({ hasText: "Não foi possível confirmar suas permissões." });
      await expect(status).toBeVisible();
      const title = await pageObject(page).getByRole("heading", { name: "Descrição", exact: true }).boundingBox();
      const notice = await status.boundingBox();
      expect(title).not.toBeNull();
      expect(notice).not.toBeNull();
      expect(notice!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
    }
    finally {
      await page.unroute("**/*");
      if (viewport) await page.setViewportSize(viewport);
    }
  });
});
