import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";

// Better Auth replaces the purpose with the password-recovery notice that migrated accounts need.
const loginNotice = "Atualizamos o acesso. Se sua conta já existia, use Esqueci minha senha para definir uma nova senha pelo e-mail cadastrado.";

test("visitante encontra cadastro na home e menu e conclui o negócio", async ({
  page,
  userCredentials,
  categoryFixture,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const homeCta = pageObject(page).getByRole("main").getByRole("button", { name: "Cadastre seu negócio ou serviço", exact: true });
  await expect(homeCta).toBeVisible();
  await expect(pageObject(page).getByText("Trabalha por conta própria? Você também pode aparecer aqui.", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("registration-home-mobile.png"), fullPage: true });
  await homeCta.focus();
  await page.keyboard.press("Enter");
  await expect(pageObject(page).getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(homeCta).toBeFocused();

  const headerCta = pageObject(page).getByRole("banner").getByRole("button", { name: "Cadastrar negócio ou serviço", exact: true }).filter({ visible: true });
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(headerCta).toBeVisible();
    const bounds = await headerCta.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeLessThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(pageObject(page).getByRole("banner").getByRole("link", { name: "Anunciar (grátis)", exact: true })).toHaveCount(0);
    await pageObject(page).getByRole("banner").screenshot({ path: testInfo.outputPath(`registration-header-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#classificados");
  const discovery = pageObject(page).getByRole("heading", { name: "Encontre em Macaé", exact: true });
  await expect.poll(async () => {
    const heading = await discovery.boundingBox();
    const header = await pageObject(page).getByRole("banner").boundingBox();
    return heading !== null && header !== null && heading.y >= header.y + header.height;
  }).toBe(true);
  await headerCta.focus();
  await page.keyboard.press("Enter");
  await expect(pageObject(page).getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(headerCta).toBeFocused();

  await click(pageObject(page).getByRole("button", { name: "Abrir menu" }));
  const menu = pageObject(page).getByRole("dialog", { name: "Explore o Tudo Macaé" });
  const menuCta = menu.getByRole("button", { name: "Cadastre seu negócio ou serviço", exact: true });
  await expect(menuCta).toBeFocused();
  await menu.screenshot({ path: testInfo.outputPath("registration-menu-mobile.png") });
  await click(menuCta);
  await expect(pageObject(page).getByRole("dialog").getByText(loginNotice, { exact: true })).toBeVisible();
  // Until its exit animation ends, the closing menu can consume Escape meant for the login dialog.
  await expect(pageObject(page).getByRole("dialog", { name: "Explore o Tudo Macaé", includeHidden: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const menuTrigger = pageObject(page).getByRole("button", { name: "Abrir menu", exact: true });
  await expect(menuTrigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menuCta).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = pageObject(page).getByRole("dialog");
  await expect(dialog.getByText(loginNotice, { exact: true })).toBeVisible();
  await dialog.getByLabel("Email", { exact: true }).fill(userCredentials.email);
  await dialog.getByLabel("Senha", { exact: true }).fill(userCredentials.password);
  await click(dialog.getByRole("button", { name: "Entrar", exact: true }));

  await expect(page).toHaveURL(/\/minha-conta\/perfis\/novo\?origem=catalogo&entrada=navigation$/u);
  await expect(pageObject(page).getByRole("heading", { name: "Criar negócio", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("initial-business-contact-mobile.png"), fullPage: true });

  const businessName = `Negócio ${makeRandomString()}`;
  await pageObject(page).getByLabel("Nome do negócio", { exact: true }).fill(businessName);
  const firstPhone = pageObject(page).getByRole("textbox", { name: "Número de contato 1" });
  await expect(firstPhone).toBeVisible();
  await expect(firstPhone).toHaveAttribute("type", "tel");
  await expect(firstPhone).toHaveAttribute("inputmode", "tel");
  await expect(firstPhone).toHaveAttribute("autocomplete", "tel");
  await expect(pageObject(page).getByRole("checkbox", { name: "WhatsApp para contato 1" })).not.toBeChecked();
  await expect(pageObject(page).getByText(/Sem contato, o cadastro fica salvo/)).toBeVisible();
  await firstPhone.focus();
  await page.keyboard.type("22988887777");
  await pageObject(page).getByLabel("Categoria da área de atuação", { exact: true }).selectOption(categoryFixture.category.id);
  await pageObject(page).getByLabel("Subcategoria da área de atuação", { exact: true }).selectOption(categoryFixture.subcategory.id);
  await click(pageObject(page).getByRole("button", { name: "Adicionar área", exact: true }));
  await expect(pageObject(page).getByText(`${categoryFixture.category.name} → ${categoryFixture.subcategory.name}`, { exact: true })).toBeVisible();
  await click(pageObject(page).getByRole("button", { name: "Criar negócio", exact: true }));

  await expect(page).toHaveURL(/\/minha-conta\/perfis\/[^/]+\/concluido$/u);
  await expect(pageObject(page).getByRole("heading", { name: `Negócio salvo: ${businessName}`, level: 1, exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("heading", { name: `Negócio salvo: ${businessName}`, level: 1, exact: true })).toBeFocused();
  await expect(pageObject(page).getByText("Seu negócio já aparece no catálogo.", { exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("link", { name: "Ver negócio", exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("link", { name: "Meus negócios", exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("link", { name: "Voltar ao catálogo", exact: true })).toBeVisible();
  const publicLink = pageObject(page).getByRole("link", { name: "Ver negócio", exact: true });
  await publicLink.focus();
  await expect(publicLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/negocio\/[^/]+\//u);

  await page.goto(`/negocios?categoria=${categoryFixture.category.id}&subcategoria=${categoryFixture.subcategory.id}`);
  await expect(pageObject(page).getByRole("link", { name: businessName, exact: true })).toBeVisible();
});

test("pessoa autenticada cria cadastro parcial e recebe caminhos para completar ou voltar", async ({
  page,
  userCredentials,
  authentication,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authentication.login(userCredentials);
  await page.goto("/negocios");
  const catalogCta = pageObject(page).getByRole("main").getByRole("button", { name: "Cadastre seu negócio ou serviço", exact: true });
  await expect(catalogCta).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(catalogCta).toBeVisible();
  expect(await catalogCta.evaluate(button => Boolean(button.closest("main > div > aside")))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await catalogCta.evaluate(button => Boolean(button.compareDocumentPosition(document.querySelector("section[aria-label=\"Resultados\"]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await click(pageObject(page).getByRole("button", { name: "Minha conta", exact: true }).filter({ visible: true }));
  const account = pageObject(page).getByRole("dialog", { name: "Minha Conta", exact: true });
  const registration = account.getByRole("link", { name: "Cadastre seu negócio ou serviço", exact: true });
  await expect(registration).toBeFocused();
  await click(registration);
  await expect(page).toHaveURL(/\/minha-conta\/perfis\/novo\?origem=catalogo&entrada=account$/u);

  const businessName = `Negócio parcial ${makeRandomString()}`;
  await pageObject(page).getByLabel("Nome do negócio", { exact: true }).fill(businessName);
  await click(pageObject(page).getByRole("button", { name: "Criar negócio", exact: true }));

  await expect(page).toHaveURL(/\/minha-conta\/perfis\/[^/]+\/concluido$/u);
  await expect(pageObject(page).getByRole("heading", { name: `Negócio salvo: ${businessName}`, level: 1, exact: true })).toBeVisible();
  await expect(pageObject(page).getByText("Cadastro salvo, mas o negócio ainda não aparece no catálogo. Falta: contato, Área de atuação ativa.", { exact: true })).toBeVisible();
  await expect(pageObject(page).getByRole("link", { name: "Ver negócio", exact: true })).toHaveCount(0);
  await expect(pageObject(page).getByRole("link", { name: "Meus negócios", exact: true })).toHaveAttribute("href", "/minha-conta/perfis");
  await expect(pageObject(page).getByRole("link", { name: "Voltar ao catálogo", exact: true })).toHaveAttribute("href", "/negocios");

  const completeLink = pageObject(page).getByRole("link", { name: "Completar cadastro", exact: true });
  await completeLink.focus();
  await expect(completeLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/minha-conta\/perfis\/[^/]+\/editar$/u);
});

test("negócio sem contato fica salvo como cadastro parcial", async ({
  page,
  userCredentials,
  authentication,
}) => {
  await authentication.login(userCredentials);
  await page.goto("/minha-conta/perfis/novo?origem=catalogo");
  const name = `Negócio parcial ${makeRandomString()}`;
  await expect(pageObject(page).getByRole("textbox", { name: "Número de contato 1" })).toHaveValue("");
  await expect(pageObject(page).getByText(/Sem contato, o cadastro fica salvo/)).toBeVisible();
  await pageObject(page).getByRole("textbox", { name: "Nome do negócio" }).fill(name);
  await click(pageObject(page).getByRole("button", { name: "Criar negócio", exact: true }));

  await expect(page).toHaveURL(/\/minha-conta\/perfis\/[^/]+\/concluido$/u);
  await expect(pageObject(page).getByRole("heading", { name: `Negócio salvo: ${name}`, exact: true })).toBeVisible();
});
