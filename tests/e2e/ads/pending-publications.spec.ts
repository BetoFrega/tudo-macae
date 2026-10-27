import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { photoReleasedFixture, readPublicationFixture, savePublicationFixture, savePublicationProfileFixture } from "../_helpers/ads/publicationFixtures";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { makePng } from "../../_helpers/makePng";

test("recalcula publicações pendentes após editar perfis e excluir anúncios", async ({
  page,
  verifiedUserCredentials,
  authentication,
  categoryFixture,
}) => {
  const adTitle = `Anúncio pendente - ${makeRandomString()}`;
  const secondAdTitle = `Segundo anúncio - ${makeRandomString()}`;
  const sharedAdTitle = `Anúncio no perfil compartilhado - ${makeRandomString()}`;
  const secondProfile = `Outro perfil - ${makeRandomString()}`;
  const publicationId = `pending-${makeRandomString()}`;
  const secondPublicationId = `pending-${makeRandomString()}`;
  const owner = verifiedUserCredentials;
  const publicationInput = {
    text: "Publicação pendente do perfil que será editado.",
    categoryId: categoryFixture.category.id,
    subcategoryId: categoryFixture.subcategory.id,
  };
  await savePublicationFixture(owner, { ...publicationInput, id: publicationId, title: adTitle });
  const firstProfileId = await savePublicationProfileFixture(owner, {
    publicationId,
    title: "Ana de Macaé",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
  });
  await createProfileFixture(owner, {
    title: secondProfile,
    description: "Perfil de outra publicação pendente.",
    contacts: [{ number: "22999999998", isWhatsapp: true }],
  });
  await Promise.all([
    savePublicationFixture(owner, { ...publicationInput, id: secondPublicationId, title: secondAdTitle, advertiserProfileId: firstProfileId }),
    savePublicationFixture(owner, { ...publicationInput, id: `pending-${makeRandomString()}`, title: sharedAdTitle, advertiserProfileId: firstProfileId }),
  ]);
  await authentication.login(verifiedUserCredentials);

  await test.step("Recalcular múltiplas publicações e perfis após edição e exclusão", async () => {
    await page.goto(`/publicar?publication=${secondPublicationId}`);
    await click(pageObject(page).getByRole("button", { name: /Quem anuncia e como entrar em contato/ }).filter({ visible: true }));
    await click(pageObject(page).getByRole("combobox", { name: "Perfil do Anunciante" }).filter({ visible: true }));
    await click(pageObject(page).getByRole("option", { name: secondProfile, exact: true }).filter({ visible: true }));
    await click(pageObject(page).getByRole("button", { name: "Editar perfil", exact: true }).filter({ visible: true }));
    await click(pageObject(page).getByRole("button", { name: "Salvar perfil", exact: true }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("3 anúncios com publicação pendente.");

    await page.goto("/minha-conta/perfis");
    const firstProfile = pageObject(page).getByRole("article", { name: "Ana de Macaé", exact: true });
    await expect(firstProfile.getByRole("link", { name: "Ver negócio", exact: true })).toHaveCount(0);
    const completeLink = firstProfile.getByRole("link", { name: "Completar cadastro: Ana de Macaé", exact: true });
    await expect(completeLink).toHaveAttribute("href", `/minha-conta/perfis/${firstProfileId}/editar`);
    await click(completeLink);
    await click(pageObject(page).getByRole("button", { name: "Remover Contato" }).filter({ visible: true }));
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("Há anúncios aguardando você completar o perfil.");
    await expect(pageObject(page).getByRole("heading", { name: secondProfile }).filter({ visible: true })).toBeVisible();
    await page.goto("/minha-conta/anuncios?filter=profile");
    await expect(pageObject(page).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByRole("heading", { name: sharedAdTitle }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByRole("heading", { name: secondAdTitle })).toHaveCount(0);

    await page.goto(`/minha-conta/perfis/${firstProfileId}/editar`);
    await click(pageObject(page).getByRole("button", { name: "Adicionar Contato" }).filter({ visible: true }));
    await pageObject(page).getByPlaceholder("(00) 00000-0000").filter({ visible: true }).fill("22999999999");
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("3 anúncios com publicação pendente.");
    await expect(pageObject(page).getByRole("heading", { name: secondProfile }).filter({ visible: true })).toBeVisible();
    await page.goto("/minha-conta/anuncios?filter=profile");
    await expect(pageObject(page).getByRole("heading", { name: adTitle })).toHaveCount(0);
    await expect(pageObject(page).getByRole("heading", { name: sharedAdTitle })).toHaveCount(0);

    await page.goto("/minha-conta/anuncios?filter=pending");
    const secondPublication = pageObject(page).getByRole("heading", { name: secondAdTitle }).filter({ visible: true }).locator("..");
    page.once("dialog", dialog => dialog.accept());
    await click(secondPublication.getByRole("button", { name: "Excluir" }));
    await expect(pageObject(page).getByRole("heading", { name: secondAdTitle })).toHaveCount(0);
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("2 anúncios com publicação pendente.");
    const sharedPublication = pageObject(page).getByRole("heading", { name: sharedAdTitle }).filter({ visible: true }).locator("..");
    page.once("dialog", dialog => dialog.accept());
    await click(sharedPublication.getByRole("button", { name: "Excluir" }));
    await expect(pageObject(page).getByRole("heading", { name: sharedAdTitle })).toHaveCount(0);
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("1 anúncio com publicação pendente.");
  });
});

test("excluir a última publicação interrompida remove o minibanner e suas fotos", async ({
  page,
  verifiedUserCredentials,
  authentication,
  createAdPage,
  categoryFixture,
}) => {
  await authentication.login(verifiedUserCredentials);
  const title = `Publicação descartada - ${makeRandomString()}`;
  await page.goto("/publicar");
  await createAdPage.fillTitle(title);
  await createAdPage.selectCategory(categoryFixture.category.name);
  await createAdPage.selectSubcategory(categoryFixture.subcategory.name);
  await createAdPage.fillAdText("Esta publicação será excluída antes de publicar.");
  await createAdPage.choosePhoto("descartada.png", "image/png", makePng(48, 32));
  await expect(createAdPage.photoCounter).toHaveText("1/3");
  await createAdPage.submit();
  await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toBeVisible();
  await expect(pageObject(page).getByRole("button", { name: /Quem anuncia e como entrar em contato/ })).toBeEnabled();
  const pendingId = new URL(page.url()).searchParams.get("publication");
  expect(pendingId).toBeTruthy();
  const pending = await readPublicationFixture(verifiedUserCredentials, pendingId!);
  expect(pending?.images).toHaveLength(1);
  const photoPath = pending!.images![0]!.path;
  await savePublicationProfileFixture(verifiedUserCredentials, { publicationId: pendingId!, title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] });

  await page.goto("/minha-conta/anuncios?filter=pending");
  const publication = pageObject(page).getByRole("heading", { name: title }).filter({ visible: true }).locator("..");
  page.once("dialog", dialog => dialog.accept());
  await click(publication.getByRole("button", { name: "Excluir" }));

  await expect(pageObject(page).getByRole("heading", { name: title })).toHaveCount(0);
  await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" })).toHaveCount(0);
  expect(await photoReleasedFixture(photoPath)).toBe(true);
});
