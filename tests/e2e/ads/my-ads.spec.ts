import { click } from "../_helpers/click";
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
  });
});

test("Titular atual administra anúncio e ex-titular perde acesso privado no D1", async ({ page, adFixture, anotherUserCredentials, userCredentials, authentication, myAdsPage, editAdPage, adDetailsPage }) => {
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
  await test.step("Permissão indisponível em celular não sobrepõe a descrição e permite nova tentativa", async () => {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    let unavailable = true;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (unavailable && request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes(adFixture.id)) {
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
      await expect(pageObject(page).getByRole("link", { name: "Editar Anúncio", exact: true })).not.toBeVisible();
      const title = await pageObject(page).getByRole("heading", { name: "Descrição", exact: true }).boundingBox();
      const notice = await status.boundingBox();
      expect(title).not.toBeNull();
      expect(notice).not.toBeNull();
      expect(notice!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
      unavailable = false;
      await click(status.getByRole("button", { name: "Tentar novamente", exact: true }));
      await expect(pageObject(page).getByRole("link", { name: "Editar Anúncio", exact: true })).toBeVisible();
      await expect(status).not.toBeVisible();
    }
    finally {
      await page.unroute("**/*");
      if (viewport) await page.setViewportSize(viewport);
    }
  });
  await authentication.login(userCredentials);
  await page.goto("/minha-conta/anuncios");
  await expect(myAdsPage.card(adFixture.title)).not.toBeVisible();
  await page.goto(`/anuncio/${adFixture.id}/editar`);
  await page.waitForURL("/");
  await adDetailsPage.gotoAd(adFixture.id, adFixture.slug);
  await expect(pageObject(page).getByRole("link", { name: "Editar Anúncio", exact: true })).not.toBeVisible();
});
