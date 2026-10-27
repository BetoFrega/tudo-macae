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
  await test.step("No celular, os controles do anúncio não sobrepõem a descrição", async () => {
    // The permission notice renders in this same controls slot; its unavailable state is covered by useAdManagementPermission.test.tsx.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      const title = await pageObject(page).getByRole("heading", { name: "Descrição", exact: true }).boundingBox();
      const controls = await pageObject(page).getByRole("link", { name: "Editar Anúncio", exact: true }).boundingBox();
      expect(title).not.toBeNull();
      expect(controls).not.toBeNull();
      const overlaps = controls!.x < title!.x + title!.width && title!.x < controls!.x + controls!.width
        && controls!.y < title!.y + title!.height && title!.y < controls!.y + controls!.height;
      expect(overlaps).toBe(false);
    }
    finally {
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
