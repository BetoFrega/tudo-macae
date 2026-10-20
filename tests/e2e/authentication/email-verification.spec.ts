import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { test, expect } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { readDisposableVerificationLink } from "../../_helpers/auth/helpers/verificationAccounts";

// Native action links must not become trace, screenshot or video artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("cadastro confirma por link nativo e retoma a publicação sem publicar automaticamente", async ({ page, browser, verifiedUserCredentials, unregisteredCredentials, registrationPage, createAdPage, categoryFixture }, testInfo) => {
  await page.goto("/publicar");
  const title = `Anúncio verificado ${Date.now()}`;
  await createAdPage.fillTitle(title);
  await createAdPage.selectCategory(categoryFixture.category.name);
  await createAdPage.selectSubcategory(categoryFixture.subcategory.name);
  await createAdPage.fillAdText("Uma bicicleta conservada para passeios em Macaé.");
  await createAdPage.submit();
  await registrationPage.switchToRegistration();
  await registrationPage.register(unregisteredCredentials.email, unregisteredCredentials.password);
  await expect(pageObject(page).getByRole("textbox", { name: "Nome do anunciante" }).filter({ visible: true })).toBeVisible();
  await pageObject(page).getByRole("textbox", { name: "Nome do anunciante" }).filter({ visible: true }).fill("Ana de Macaé");
  await pageObject(page).getByRole("textbox", { name: "Telefone 1" }).filter({ visible: true }).fill("22999999999");
  await pageObject(page).getByRole("radio", { name: "Meu perfil pessoal", exact: true }).filter({ visible: true }).check();
  await click(pageObject(page).getByRole("button", { name: "Criar perfil", exact: true }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true })).toBeDisabled();
  const publication = new URL(page.url()).searchParams.get("publication")!;
  await click(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true }).getByRole("link", { name: "Verificar e-mail" }));
  await expect(pageObject(page).getByRole("heading", { name: "Confirme seu e-mail" }).filter({ visible: true })).toBeVisible();
  await expect(pageObject(page).getByRole("region", { name: "Confirme seu e-mail", exact: true }).filter({ visible: true }).getByText(unregisteredCredentials.email, { exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("status").filter({ visible: true }).filter({ hasText: /E-mail enviado|Link disponível no console/ })).toBeVisible();
  const link = await readDisposableVerificationLink(unregisteredCredentials.email, { publication });
  const separate = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const confirmation = await separate.newPage();
    // Evaluate keeps the credential out of Playwright navigation step titles.
    await confirmation.goto(new URL("/minha-conta/acao", page.url()).href);
    // A suspended session read must not trap the continuation in its provider queue.
    await confirmation.route("**/api/autenticacao/sessao", () => {});
    await confirmation.evaluate(url => window.location.assign(url), link);
    await expect(pageObject(confirmation).getByRole("heading", { name: "E-mail confirmado", exact: true }).filter({ visible: true })).toBeVisible({ timeout: 20_000 });
    await expect(pageObject(confirmation).getByRole("alert").filter({ hasText: "Não foi possível atualizar sua sessão." })).toContainText("a página será carregada novamente");
    // Capture only the redacted, synthetic confirmation state; never the action URL.
    expect(new URL(confirmation.url()).search).toBe("");
    for (const width of [1280, 1440, 390]) {
      await confirmation.setViewportSize({ width, height: 844 });
      const capture = testInfo.outputPath(`confirmation-session-recovery-${width}.png`);
      await confirmation.screenshot({ path: capture, fullPage: true });
      await testInfo.attach(`confirmed email with session recovery, ${width}px`, { path: capture, contentType: "image/png" });
    }
    await confirmation.unroute("**/api/autenticacao/sessao");
    const continuationDocument = confirmation.waitForRequest(request => request.isNavigationRequest() && request.resourceType() === "document" && new URL(request.url()).pathname === "/minha-conta/verificar-email");
    await click(pageObject(confirmation).getByRole("link", { name: "Continuar publicação" }).filter({ visible: true }));
    await continuationDocument;
    await click(pageObject(confirmation).getByRole("button", { name: "Entrar na minha conta" }).filter({ visible: true }));
    await pageObject(confirmation).getByRole("textbox", { name: "Email" }).fill(verifiedUserCredentials.email);
    await pageObject(confirmation).getByRole("textbox", { name: "Senha" }).fill(verifiedUserCredentials.password);
    await click(pageObject(confirmation).getByRole("button", { name: "Entrar", exact: true }));
    await expect(pageObject(confirmation).getByRole("button", { name: "Minha conta", exact: true })).toBeVisible();
    await confirmation.goto(new URL(`/minha-conta/verificar-email?publication=${publication}`, page.url()).href);
    await expect(pageObject(confirmation).getByRole("heading", { name: "E-mail confirmado", exact: true }).filter({ visible: true })).toBeVisible();
    await expect(pageObject(confirmation).getByRole("link", { name: "Ir para minha conta", exact: true }).filter({ visible: true })).toHaveAttribute("href", "/minha-conta/anuncios");
    await expect(pageObject(confirmation).getByRole("link", { name: "Continuar publicação" })).toHaveCount(0);
  }
  finally { await separate.close(); }
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(pageObject(page).getByRole("heading", { name: "E-mail confirmado", exact: true }).filter({ visible: true })).toBeVisible();
  await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).not.toContainText("Confirme seu e-mail");
  await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta" }).filter({ visible: true })).toContainText("1 anúncio com publicação pendente.");
  await click(pageObject(page).getByRole("link", { name: "Continuar publicação" }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true })).toBeEnabled();
  await expect(pageObject(page).getByRole("heading", { name: "Seu anúncio está publicado" })).toHaveCount(0);
  await click(pageObject(page).getByRole("button", { name: "Publicar anúncio", exact: true }).filter({ visible: true }));
  await expect(pageObject(page).getByRole("heading", { name: "Seu anúncio está publicado" }).filter({ visible: true })).toBeVisible();
});

test("corrige o e-mail com senha e aplica o link nativo antes de trocar o acesso", async ({ page, userCredentials, authentication }) => {
  await authentication.login(userCredentials);
  await page.goto("/minha-conta/verificar-email");
  expect(new URL(page.url()).search).toBe("");
  await click(pageObject(page).getByText("Corrigir meu e-mail", { exact: true }).filter({ visible: true }));
  const corrected = `corrected-${userCredentials.email}`;
  await pageObject(page).getByRole("textbox", { name: "Novo e-mail" }).filter({ visible: true }).fill(corrected);
  await pageObject(page).getByLabel("Senha atual").filter({ visible: true }).fill(userCredentials.password);
  await click(pageObject(page).getByRole("button", { name: /Enviar para o novo e-mail|Gerar link para o novo e-mail/ }).filter({ visible: true }));
  await expect(pageObject(page).getByText(/O novo endereço só valerá após confirmar/).filter({ visible: true })).toBeVisible();
  await expect(pageObject(page).getByRole("region", { name: "Confirme seu e-mail", exact: true }).filter({ visible: true }).getByText(userCredentials.email, { exact: true })).toBeVisible();
  const link = await readDisposableVerificationLink(userCredentials.email, { newEmail: corrected });
  await page.evaluate(url => window.location.assign(url), link);
  await expect(pageObject(page).getByRole("heading", { name: "E-mail confirmado", exact: true }).filter({ visible: true })).toBeVisible();
  await authentication.login({ email: corrected, password: userCredentials.password });
  await page.goto("/minha-conta/verificar-email");
  await expect(pageObject(page).getByRole("heading", { name: "E-mail confirmado", exact: true }).filter({ visible: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});
