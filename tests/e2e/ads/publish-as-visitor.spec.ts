import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { confirmDisposableEmail } from "../../_helpers/auth/helpers/verificationAccounts";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { loginUser } from "../_helpers/auth/helpers/authentication";
import { makePng } from "../../_helpers/makePng";
import { CreateAdPage } from "../_helpers/ads/POMs/CreateAdPage";

test("visitante deslogado publica anúncio registrando-se no modal", async ({
  page,
  browser,
  unregisteredCredentials,
  registrationPage,
  createAdPage,
  categoryFixture,
}) => {
  let publicationUrl = "";
  const adTitle = `Anúncio de Visitante - ${makeRandomString()}`;
  const adText = `Descrição do anúncio criado por um visitante - ${makeRandomString()}`;
  const capture = async (stage: string) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const screenshotPath = test.info().outputPath(`${stage}-${viewport.width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await test.info().attach(`${stage}-${viewport.width}`, { path: screenshotPath, contentType: "image/png" });
    }
  };

  await test.step("Preencher o formulário sem estar logado", async () => {
    await page.goto("/publicar");

    // The visitor sees the form itself, not a login gate.
    await expect(
      pageObject(page).getByRole("heading", { name: /Publicar anúncio/i }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      pageObject(page).getByRole("textbox", { name: /Título do anúncio/i }).filter({ visible: true }),
    ).toBeVisible();
    // With no profiles of their own, there is nothing to choose between.
    // Asserted by count: the form is known to be rendered by this point, so
    // zero matches means the field is absent rather than merely not painted yet.
    await expect(pageObject(page).getByText("Perfil do Anunciante")).toHaveCount(0);

    await createAdPage.fillTitle(adTitle);
    await createAdPage.selectCategory(categoryFixture.category.name);
    await createAdPage.selectSubcategory(categoryFixture.subcategory.name);
    await createAdPage.fillAdText(adText);
    await createAdPage.choosePhoto("bicicleta.png", "image/png", makePng(48, 32));
    await expect(createAdPage.photoCounter).toHaveText("1/3");
    await createAdPage.photoTitleField().fill("Bicicleta vista de frente");
    await createAdPage.choosePhoto("bicicleta-lado.png", "image/png", makePng(32, 48));
    await expect(createAdPage.photoCounter).toHaveText("2/3");
    await createAdPage.photoTitleField(1).fill("Bicicleta vista de lado");
  });

  await test.step("Submeter abre o modal de login", async () => {
    await click(pageObject(page).getByRole("button", { name: "Continuar", exact: true }).filter({ visible: true }));

    await expect(
      pageObject(page).getByRole("heading", { name: "Entre na sua conta" }).filter({ visible: true }),
    ).toBeVisible();
  });

  await test.step("Cadastrar mantém a publicação pendente sem perfil automático", async () => {
    await registrationPage.switchToRegistration();
    await registrationPage.register(unregisteredCredentials.email, unregisteredCredentials.password);
    await expect(pageObject(page).getByRole("button", { name: "Minha conta" }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByRole("status").filter({ hasText: "2 de 2 fotos salvas" })).toBeVisible();
    await expect(page).toHaveURL(/publicar\?publication=/);
    const recoveredUrl = page.url();
    await page.reload();
    await click(pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
    await expect(createAdPage.photoCounter).toHaveText("2/3");
    await expect(createAdPage.photoTitleField()).toHaveValue("Bicicleta vista de frente");
    await expect(createAdPage.photoTitleField(1)).toHaveValue("Bicicleta vista de lado");
    const firstPhoto = pageObject(page).getByRole("img", { name: "Bicicleta vista de frente" }).filter({ visible: true });
    await expect(firstPhoto).not.toHaveJSProperty("naturalWidth", 0);
    const privatePhotoSrc = await firstPhoto.getAttribute("src");
    expect(privatePhotoSrc).toBeTruthy();
    const privatePhotoUrl = new URL(privatePhotoSrc!, page.url());
    expect(privatePhotoUrl.origin).toBe(new URL(page.url()).origin);
    expect(privatePhotoUrl.pathname).toMatch(/^\/api\/publicacoes-pendentes\//);
    const publicPhotoUrl = new URL(privatePhotoUrl);
    publicPhotoUrl.pathname = publicPhotoUrl.pathname.replace("/api/publicacoes-pendentes/", "/api/anuncios/");
    expect((await page.request.get(publicPhotoUrl.href)).status()).toBe(404);
    const anonymous = await browser.newContext();
    try {
      const response = await anonymous.request.get(privatePhotoUrl.href);
      expect(response.status()).toBe(404);
    }
    finally { await anonymous.close(); }
    await capture("fotos-retomadas");
    await page.goto(recoveredUrl);
    await expect(pageObject(page).getByRole("button", { name: "Criar perfil", exact: true }).filter({ visible: true })).toBeVisible();
    const reminder = pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true });
    await expect(reminder).toContainText("Confirme seu e-mail para publicar anúncios.");

    const recovery = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const recoveryPage = await recovery.newPage();
      await loginUser(recoveryPage, unregisteredCredentials);
      await expect(pageObject(recoveryPage).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("Confirme seu e-mail para publicar anúncios.");
      await recoveryPage.goto(recoveredUrl);
      await click(pageObject(recoveryPage).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
      await expect(pageObject(recoveryPage).getByTestId("photo-counter").filter({ visible: true })).toHaveText("2/3");
      const recoveredAd = new CreateAdPage(recoveryPage);
      await expect(recoveredAd.photoTitleField()).toHaveValue("Bicicleta vista de frente");
      await expect(recoveredAd.photoTitleField(1)).toHaveValue("Bicicleta vista de lado");
    }
    finally { await recovery.close(); }

    await page.goto("/minha-conta/anuncios?filter=profile");
    await expect(pageObject(page).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
    await click(pageObject(page).getByRole("link", { name: "Concluir publicação", exact: true }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("textbox", { name: "Nome do anunciante" }).filter({ visible: true })).toBeVisible();
  });

  await test.step("Criar perfil não publica e abre a revisão", async () => {
    await pageObject(page).getByRole("textbox", { name: "Nome do anunciante" }).filter({ visible: true }).fill("Ana de Macaé");
    await pageObject(page).getByRole("textbox", { name: "Telefone 1" }).filter({ visible: true }).fill("22999999999");
    // Only the API Worker composition asks the journey for the identity type.
    await pageObject(page).getByRole("radio", { name: "Meu perfil pessoal", exact: true }).filter({ visible: true }).check();
    await capture("perfil");
    await click(pageObject(page).getByRole("button", { name: "Criar perfil", exact: true }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true })).toBeDisabled();
    await expect(pageObject(page).getByText("Fotos a publicar", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByText("Bicicleta vista de frente · Bicicleta vista de lado", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("Confirme seu e-mail para publicar anúncios.");
    await expect(page).toHaveURL(/publicar\?publication=/);
    publicationUrl = page.url();
    await capture("revisao");
    await click(pageObject(page).locator("#publication-panel-publication").getByRole("link", { name: "Verificar e-mail" }));
    await expect(page).toHaveURL(/verificar-email\?publication=/);
    await confirmDisposableEmail(unregisteredCredentials.email);
    await page.reload();
    await click(pageObject(page).getByRole("link", { name: "Continuar publicação" }).filter({ visible: true }));
    await expect(page).toHaveURL(publicationUrl);
    await expect(pageObject(page).getByText("Bicicleta vista de frente · Bicicleta vista de lado", { exact: true }).filter({ visible: true })).toBeVisible();
  });

  await test.step("Substituir uma foto no limite de três conserva a seleção e permite retomar", async () => {
    await click(pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
    await createAdPage.choosePhoto("bicicleta-detalhe.png", "image/png", makePng(32, 32));
    await expect(createAdPage.photoCounter).toHaveText("3/3");
    await createAdPage.photoTitleField(2).fill("Detalhe antigo");
    await createAdPage.submit();
    await expect(pageObject(page).getByRole("status").filter({ hasText: "3 de 3 fotos salvas" })).toBeVisible();
    await click(pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
    await click(pageObject(page).getByRole("button", { name: "Remover foto 3", exact: true }).filter({ visible: true }));
    await createAdPage.choosePhoto("bicicleta-detalhe-novo.png", "image/png", makePng(40, 40));
    await expect(createAdPage.photoCounter).toHaveText("3/3");
    await createAdPage.photoTitleField(2).fill("Detalhe novo");
    await createAdPage.submit();
    await expect(pageObject(page).getByRole("status").filter({ hasText: "3 de 3 fotos salvas" })).toBeVisible();
    await page.reload();
    await click(pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
    await expect(createAdPage.photoCounter).toHaveText("3/3");
    await expect(createAdPage.photoTitleField(2)).toHaveValue("Detalhe novo");
    await expect(pageObject(page).getByRole("img", { name: "Detalhe novo", exact: true }).filter({ visible: true })).not.toHaveJSProperty("naturalWidth", 0);
    await click(pageObject(page).getByRole("button", { name: /^Publicação/ }).filter({ visible: true }));
  });

  await test.step("Publicação salva a revisão da foto sem exigir Continuar ou um segundo clique", async () => {
    await click(pageObject(page).getByRole("button", { name: /Seu anúncio/ }).filter({ visible: true }));
    await createAdPage.photoTitleField(1).fill("Bicicleta vista de lado revisada");
    await expect(pageObject(page).getByRole("status").filter({ hasText: "as alterações nas fotos ainda não foram salvas" })).toBeVisible();
    await click(pageObject(page).getByRole("button", { name: /^Publicação/ }).filter({ visible: true }));
    await expect(pageObject(page).getByText("Bicicleta vista de frente · Bicicleta vista de lado revisada · Detalhe novo", { exact: true }).filter({ visible: true })).toBeVisible();
    await click(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("heading", { name: "Seu anúncio está publicado" }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" })).toHaveCount(0);
    await expect.poll(async () => {
      const heading = await pageObject(page).getByRole("heading", { name: "Seu anúncio está publicado", exact: true }).filter({ visible: true }).boundingBox();
      const header = await pageObject(page).locator("header.sticky").filter({ visible: true }).boundingBox();
      return heading && header ? heading.y - (header.y + header.height) : -1;
    }).toBeGreaterThanOrEqual(0);
    await capture("publicado");
    const url = await pageObject(page).getByRole("link", { name: "Ver anúncio", exact: true }).filter({ visible: true }).getAttribute("href");
    expect(url).toBeTruthy();
    await click(pageObject(page).getByRole("link", { name: "Ver anúncio", exact: true }).filter({ visible: true }));
    await expect(pageObject(page).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(page).getByText("Este anúncio está pausado e pode não ter mais validade.")).toHaveCount(0);
    const visitor = await page.context().browser()!.newContext();
    try {
      const publicPage = await visitor.newPage();
      await publicPage.goto(new URL(url!, page.url()).href);
      await expect(pageObject(publicPage).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
      const publishedPhoto = pageObject(publicPage).getByRole("button", { name: "Bicicleta vista de frente" }).getByRole("img", { name: "Bicicleta vista de frente" });
      await expect(publishedPhoto).toBeVisible();
      await expect.poll(async () => decodeURIComponent(await publishedPhoto.getAttribute("src") ?? "")).toContain("/api/anuncios/");
      await expect(publishedPhoto).not.toHaveJSProperty("naturalWidth", 0);
      await expect(pageObject(publicPage).getByRole("button", { name: "Bicicleta vista de lado revisada", exact: true })).toBeVisible();
      const categoryPath = `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`;
      await publicPage.goto(new URL(categoryPath, page.url()).href);
      await expect(pageObject(publicPage).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
      await publicPage.goto(new URL(`${categoryPath}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`, page.url()).href);
      await expect(pageObject(publicPage).getByRole("heading", { name: adTitle }).filter({ visible: true })).toBeVisible();
    }
    finally { await visitor.close(); }
  });
});
