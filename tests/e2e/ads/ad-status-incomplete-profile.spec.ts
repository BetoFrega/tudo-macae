import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { readDisposableVerificationLink } from "../../_helpers/auth/helpers/verificationAccounts";
import { unconfirmDisposableEmail } from "../../_helpers/auth/helpers/verificationAccounts";
import { expect, test } from "../_helpers/fixtures/readonly-category-test";
import { click } from "../_helpers/click";
import { slugify } from "@tudomacae/text-normalization/slugify";

// Native verification links must not become trace, screenshot or video artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("Ad Status Management", () => {
  test("Jornada: perfil incompleto orienta a lista e só a repetição explícita ativa", async ({
    page,
    browser,
    userCredentials,
    authentication,
    pausedAdFixture,
    adProfileFixture,
    categoryFixture,
    myAdsPage,
    profilePage,
  }) => {
    await authentication.login(userCredentials);
    await page.goto(`/minha-conta/perfis/${adProfileFixture.id}/editar`);
    await expect(profilePage.removeContactButtons).toHaveCount(adProfileFixture.contacts?.length ?? 0);
    while (await profilePage.removeContactButtons.count()) {
      await click(profilePage.firstRemoveContactButton);
    }
    await expect(profilePage.contactInputs).toHaveCount(0);
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));
    await expect(page).toHaveURL(/\/minha-conta\/perfis$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await myAdsPage.goto();
    const card = myAdsPage.card(pausedAdFixture.title);

    await click(card.getByRole("button", { name: "Abrir menu" }));
    const activate = pageObject(page).getByRole("menuitem", { name: "Ativar", exact: true }).filter({ visible: true });
    await activate.focus();
    await page.keyboard.press("Enter");

    await expect(card.getByRole("alert")).toContainText("contato válido");
    await expect(card.getByText("Pausado", { exact: true })).toBeVisible();
    const popupPromise = page.waitForEvent("popup");
    await click(card.getByRole("link", { name: "Corrigir perfil" }));
    const profile = await popupPromise;
    await expect(pageObject(profile).getByRole("heading", { name: "Editar Perfil" }).filter({ visible: true })).toBeVisible();
    await click(pageObject(profile).getByRole("button", { name: "Adicionar Contato" }).filter({ visible: true }));
    await pageObject(profile).getByPlaceholder("(00) 00000-0000").filter({ visible: true }).fill("22999999999");
    await click(pageObject(profile).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));
    await expect(profile).toHaveURL(`/anuncio/${pausedAdFixture.id}/editar`);
    await profile.close();

    await page.bringToFront();
    await expect(card.getByText("Pausado", { exact: true })).toBeVisible();
    await click(card.getByRole("button", { name: "Tentar novamente" }));
    await expect(card.getByRole("status")).toContainText("Anúncio ativo");
    await expect(card.getByRole("link", { name: "Ver anúncio" })).toBeVisible();

    const visitorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/anuncio/${pausedAdFixture.id}/${pausedAdFixture.slug}`);
    await expect(pageObject(visitor).getByRole("heading", { name: pausedAdFixture.title }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(visitor).getByText("Este anúncio está pausado e pode não ter mais validade.")).toHaveCount(0);
    const categoryPath = `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`;
    await visitor.goto(categoryPath);
    await expect(pageObject(visitor).getByText(pausedAdFixture.title, { exact: true }).filter({ visible: true })).toBeVisible();
    await visitor.goto(`${categoryPath}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`);
    await expect(pageObject(visitor).getByText(pausedAdFixture.title, { exact: true }).filter({ visible: true })).toBeVisible();
    await visitorContext.close();
  });

  test("Jornada: confirmação de e-mail preserva a edição e exige nova ação", async ({
    page,
    browser,
    userCredentials,
    authentication,
    pausedAdFixture,
    myAdsPage,
  }) => {
    await unconfirmDisposableEmail(userCredentials.email);
    await authentication.login(userCredentials);
    await myAdsPage.goto();
    await myAdsPage.editAd(pausedAdFixture.title);
    const changedTitle = `${pausedAdFixture.title} revisado`;
    await pageObject(page).getByLabel("Título do Anúncio").filter({ visible: true }).fill(changedTitle);
    await click(pageObject(page).getByRole("switch").filter({ visible: true }));
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));

    const emailRecovery = pageObject(page).getByRole("alert").filter({ visible: true }).filter({ hasText: "Confirme seu e-mail" });
    await expect(emailRecovery).toBeVisible();
    await expect(pageObject(page).getByLabel("Título do Anúncio").filter({ visible: true })).toHaveValue(changedTitle);
    const popupPromise = page.waitForEvent("popup");
    await click(emailRecovery.getByRole("link", { name: "Verificar e-mail" }));
    const verification = await popupPromise;
    await click(pageObject(verification).getByRole("button", { name: /Enviar e-mail|Gerar link de confirmação/ }).filter({ visible: true }));
    await expect(pageObject(verification).getByRole("status").filter({
      hasText: /E-mail enviado|Link disponível no console/,
      visible: true,
    })).toBeVisible();
    const link = await readDisposableVerificationLink(userCredentials.email, { ad: pausedAdFixture.id });
    await verification.evaluate(url => window.location.assign(url), link);
    await expect(pageObject(verification).getByRole("heading", { name: "E-mail confirmado", exact: true }).filter({ visible: true })).toBeVisible();
    const continueToVerification = pageObject(verification).getByRole("link", { name: "Voltar ao anúncio" }).filter({ visible: true });
    await expect(continueToVerification).toHaveAttribute(
      "href",
      `/minha-conta/verificar-email?ad=${pausedAdFixture.id}`,
    );
    await click(continueToVerification);
    await expect(pageObject(verification).getByRole("link", { name: "Voltar ao anúncio" }).filter({ visible: true })).toHaveAttribute(
      "href",
      `/anuncio/${pausedAdFixture.id}/editar`,
    );

    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(pageObject(page).getByLabel("Título do Anúncio").filter({ visible: true })).toHaveValue(changedTitle);
    await click(pageObject(page).getByRole("button", { name: "Salvar Alterações" }).filter({ visible: true }));
    const publicPath = `/anuncio/${pausedAdFixture.id}/${slugify(changedTitle)}`;
    await expect(page).toHaveURL(url => url.pathname === publicPath);

    const visitorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const visitor = await visitorContext.newPage();
    await visitor.goto(publicPath);
    await expect(pageObject(visitor).getByRole("heading", { name: changedTitle }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(visitor).getByText("Este anúncio está pausado e pode não ter mais validade.")).toHaveCount(0);
    await visitorContext.close();
  });
});
