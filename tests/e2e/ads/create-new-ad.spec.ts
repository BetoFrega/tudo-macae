import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures/readonly-category-test";
import { makeRandomString } from "../../_helpers/makeRandomString";

test("Jornada: proprietário publica, edita e exclui anúncio sem foto", async ({ page, verifiedUserCredentials: userCredentials, authentication, header, createAdPage, categoryFixture, adDetailsPage, editAdPage }) => {
  await authentication.login(userCredentials);
  await header.clickCreateAd();

  const adTitle = `Test Ad - ${makeRandomString()}`;
  await createAdPage.fillTitle(adTitle);
  await createAdPage.selectCategory(categoryFixture.category.name);
  await createAdPage.selectSubcategory(categoryFixture.subcategory.name);

  const adText = `This is a test ad description - ${makeRandomString()}`;
  await createAdPage.fillAdText(adText);
  await createAdPage.submit();
  await createAdPage.finishPublication();

  await page.waitForURL(/anuncio\/\w+\/[\w-]+$/);
  await expect(pageObject(page).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();

  const adUrl = page.url();
  await test.step("Editar o anúncio publicado", async () => {
    await adDetailsPage.clickEdit();

    const editedAdText = `Anúncio EDITADO para teste. ID: ${makeRandomString()}`;
    await editAdPage.fillAdText(editedAdText);
    await editAdPage.saveChanges();

    await page.waitForURL(/\/anuncio\/[^/]+\/[^/]+$/);
    await expect(
      pageObject(page).getByText(editedAdText).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      pageObject(page).getByText(adText).filter({ visible: true }),
    ).not.toBeVisible();
  });
  await test.step("Excluir e verificar lista e detalhe removidos", async () => {
    await adDetailsPage.clickDelete();
    await adDetailsPage.confirmDelete();

    // The redirect confirms completion and cache invalidation before absence checks.
    await page.waitForURL("**/minha-conta/anuncios");
    await expect(pageObject(page).getByRole("link", { name: adTitle }).filter({ visible: true })).not.toBeVisible();

    // Verify the deleted ad shows not found
    await page.goto(adUrl);
    await expect(
      pageObject(page).getByText(
        "O anúncio que você está procurando não existe ou foi removido.",
      ).filter({ visible: true }),
    ).toBeVisible();
  });
});
