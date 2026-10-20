import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { makePng } from "../../_helpers/makePng";
import { makeRandomString } from "../../_helpers/makeRandomString";

const SMALL_PNG = makePng(48, 32);

/**
 * The blast radius of #306: the validation and the processing of an ad photo
 * moved to the acervo, and for the advertiser nothing may change. This covers
 * the whole round trip through the moved code — refusal message included — with
 * the ad's own image model untouched: the photo still lives in the ad document,
 * under `ad-images/`, and no media is registered in the acervo.
 */
test.describe("Anúncio com foto", () => {
  test("Anunciante cria um anúncio com foto, e a foto sobrevive à edição", async ({
    page,
    verifiedUserCredentials: userCredentials,
    authentication,
    header,
    createAdPage,
    adDetailsPage,
    editAdPage,
    categoryFixture,
  }) => {
    const adTitle = `Bicicleta seminova ${makeRandomString()}`;
    const photoTitle = `Frente da bicicleta ${makeRandomString()}`;
    const secondPhotoTitle = `Lateral da bicicleta ${makeRandomString()}`;

    await authentication.login(userCredentials);
    await header.clickCreateAd();

    await test.step("Um arquivo que não é imagem é recusado com a mensagem de sempre", async () => {
      await createAdPage.choosePhoto(
        "planilha.pdf",
        "application/pdf",
        Buffer.from("not-an-image"),
      );

      await expect(
        pageObject(page).getByText("Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF.").filter({ visible: true }),
      ).toBeVisible();
      await expect(createAdPage.photoCounter).toHaveText("0/3");
    });

    await test.step("Publicar o anúncio com uma foto", async () => {
      await createAdPage.choosePhoto("bicicleta.png", "image/png", SMALL_PNG);
      await expect(createAdPage.photoCounter).toHaveText("1/3");
      await createAdPage.photoTitleField().fill(photoTitle);

      await createAdPage.fillTitle(adTitle);
      await createAdPage.selectCategory(categoryFixture.category.name);
      await createAdPage.selectSubcategory(categoryFixture.subcategory.name);
      await createAdPage.fillAdText(`Bicicleta em bom estado ${makeRandomString()}`);
      await createAdPage.submit();
      await createAdPage.finishPublication();
    });

    await page.waitForURL(/anuncio\/\w+\/[\w-]+$/);

    await test.step("A foto aparece no anúncio, guardada com o anúncio", async () => {
      const photo = pageObject(page).getByRole("img", { name: photoTitle }).filter({ visible: true });
      await expect(photo).toBeVisible();

      const source = (await photo.getAttribute("src")) ?? "";
      expect(decodeURIComponent(decodeURIComponent(source)))
        .toMatch(/\/api\/anuncios\/[^/"?]+\/fotos\/[^/"?]+/);
      await expect(photo).not.toHaveJSProperty("naturalWidth", 0);
      const jpeg = await page.request.get(source, { headers: { accept: "image/jpeg" } });
      expect(jpeg.status()).toBe(200);
      expect(jpeg.headers()["content-type"]).toBe("image/jpeg");

      await expect(pageObject(page).getByText("Este anúncio não possui fotos.").filter({ visible: true })).not.toBeVisible();
    });

    const editedText = `Bicicleta revisada esta semana ${makeRandomString()}`;

    await test.step("Editar o anúncio, com a foto já lá", async () => {
      await adDetailsPage.clickEdit();
      await expect(editAdPage.photoCounter).toHaveText("1/3");
      await expect(editAdPage.photoTitleField()).toHaveValue(photoTitle);
      const preview = pageObject(page).getByRole("img", { name: photoTitle }).filter({ visible: true });
      await expect(preview).toBeVisible();
      await expect(preview).not.toHaveJSProperty("naturalWidth", 0);
      const previewSource = new URL((await preview.getAttribute("src")) ?? "", page.url());
      expect(previewSource.origin).toBe(new URL(page.url()).origin);
      expect(previewSource.pathname).toMatch(/^\/api\/anuncios\/[^/]+\/fotos\/[^/]+$/u);
      expect(previewSource.searchParams.get("w")).toMatch(/^\d+$/u);

      await editAdPage.choosePhoto("lateral.png", "image/png", SMALL_PNG);
      await expect(editAdPage.photoCounter).toHaveText("2/3");
      await editAdPage.photoTitleField(1).fill(secondPhotoTitle);

      await editAdPage.fillAdText(editedText);
      await editAdPage.saveChanges();
    });

    await test.step("O texto mudou e a foto continua lá", async () => {
      await page.waitForURL(/anuncio\/\w+\/[\w-]+$/);
      await expect(pageObject(page).getByText(editedText).filter({ visible: true })).toBeVisible();
      const photo = pageObject(page).getByRole("button", { name: photoTitle }).getByRole("img", { name: photoTitle });
      await expect(photo).toBeVisible();
      await expect(photo).not.toHaveJSProperty("naturalWidth", 0);
      const secondPhoto = pageObject(page).getByRole("button", { name: secondPhotoTitle }).getByRole("img", { name: secondPhotoTitle });
      await expect(secondPhoto).toBeVisible();
      await expect(secondPhoto).not.toHaveJSProperty("naturalWidth", 0);
    });

    await test.step("A listagem preserva a foto pelo fallback local controlado", async () => {
      await page.goto("/#classificados");
      const cardPhoto = pageObject(page)
        .getByRole("img", { name: adTitle })
        .filter({ visible: true });
      await expect(cardPhoto).toBeVisible();
      await expect(cardPhoto).not.toHaveJSProperty("naturalWidth", 0);
    });
  });
});
