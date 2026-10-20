import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { updateProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { savePublicationFixture, savePublicationProfileFixture, setPublicationImagesFixture } from "../_helpers/ads/publicationFixtures";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { makeRandomString } from "../../_helpers/makeRandomString";

test("publicação com foto ausente volta à edição na mesma página", async ({ page, verifiedUserCredentials, authentication, categoryFixture }, testInfo) => {
  test.fixme(true, "Missing-photo recovery is lost on D1: https://github.com/BetoFrega/macae-classificados/issues/2037");
  const id = `pending-${makeRandomString()}`;
  await savePublicationFixture(verifiedUserCredentials, {
    id, title: "Bicicleta para reparar", text: "Bicicleta usada em bom estado.",
    categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id,
  });
  await savePublicationProfileFixture(verifiedUserCredentials, { publicationId: id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  await authentication.login(verifiedUserCredentials);
  await page.setViewportSize({ width: 390, height: 844 });
  // A missing linked object is a malformed precondition that public photo operations cannot create.
  await setPublicationImagesFixture(id, [{ id: crypto.randomUUID(), path: `ad-images/${id}/pending/missing.png`, title: "Frente", description: "", order: 0 }]);
  await page.goto(`/publicar?publication=${id}`);
  const adStep = pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true });
  await expect(adStep).toBeEnabled();
  await click(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("alert").filter({ hasText: "Remova ou substitua a foto" })).toBeVisible();
  await expect(pageObject(page).getByRole("status").filter({ hasText: "Revise a foto indisponível" })).toBeVisible();
  await expect(adStep).toBeEnabled();
  await click(adStep);
  await expect(pageObject(page).getByTestId("photo-counter").filter({ visible: true })).toHaveText("1/3");
  await page.screenshot({ path: testInfo.outputPath("missing-photo-recovery-mobile.png"), fullPage: true });
});

test("perfil alterado em outra sessão pode ser corrigido antes da publicação", async ({ page, verifiedUserCredentials, authentication, categoryFixture }, testInfo) => {
  const id = `pending-${makeRandomString()}`;
  await savePublicationFixture(verifiedUserCredentials, {
    id, title: "Bicicleta para reparar", text: "Bicicleta usada em bom estado.",
    categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id,
  });
  const profileId = await savePublicationProfileFixture(verifiedUserCredentials, { publicationId: id, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  await authentication.login(verifiedUserCredentials);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/publicar?publication=${id}`);
  const publishButton = pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true });
  await expect(publishButton).toBeVisible();
  await expect(publishButton).toBeEnabled();
  await updateProfileFixture(verifiedUserCredentials, { id: profileId, title: "Ana", description: "", contacts: [] });
  await click(publishButton);
  await expect(pageObject(page).getByRole("alert").filter({ hasText: "Complete o nome e um contato" })).toBeVisible();
  const profileStep = pageObject(page).getByRole("button", { name: /Quem anuncia e como entrar em contato/ }).filter({ visible: true });
  await expect(profileStep).toHaveAttribute("aria-expanded", "true");
  const phone = pageObject(page).getByRole("textbox", { name: "Telefone 1", exact: true }).filter({ visible: true });
  await expect(phone).toHaveValue("");
  await page.screenshot({ path: testInfo.outputPath("profile-recovery-mobile.png"), fullPage: true });
  await phone.fill("22988888888");
  await click(pageObject(page).getByRole("button", { name: "Salvar perfil", exact: true }).filter({ visible: true }));
  await click(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("heading", { name: "Seu anúncio está publicado", exact: true }).filter({ visible: true })).toBeVisible();
});
