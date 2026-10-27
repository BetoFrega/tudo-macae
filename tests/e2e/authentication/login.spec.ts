import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { readDisposablePasswordResetLink } from "../../_helpers/auth/helpers/verificationAccounts";
import { makeTestPassword } from "../../_helpers/auth/helpers/makeTestPassword";
import { SITE_SEARCH_FAKE_TOKEN } from "../bin/siteSearchFake";

// Native one-use recovery links must stay out of traces and media artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

test("Jornada: login real, navegação da conta, logout e recuperação de senha", async ({
  page,
  context,
  browser,
  loginPage,
  userCredentials,
  userSidebar,
  header,
}, testInfo) => {
  await test.step("Antes da hidratação, a senha permanece fora da URL", async () => {
    const plain = await browser.newContext();
    // Inline streaming scripts reveal server-rendered content before hydration.
    await plain.route("**/_next/static/**", route =>
      route.request().resourceType() === "script" ? route.abort() : route.continue());
    try {
      const recovery = await plain.newPage();
      await recovery.goto(new URL("/minha-conta/acao?mode=resetPassword&token=disposable-proof&oobCode=disposable-proof", test.info().project.use.baseURL).href);
      const marker = "disposable-password-marker";
      await pageObject(recovery).getByLabel("Nova Senha", { exact: true }).filter({ visible: true }).fill(marker);
      let submission: { navigation: boolean; method: string; passwordInQuery: boolean; passwordInBody: boolean } | undefined;
      await recovery.route("**/minha-conta/acao**", async (route) => {
        const request = route.request();
        submission = {
          navigation: request.isNavigationRequest(),
          method: request.method(),
          passwordInQuery: new URL(request.url()).searchParams.has("new-password"),
          passwordInBody: new URLSearchParams(request.postData() ?? "").get("new-password") === marker,
        };
        await route.fulfill({ status: 200, contentType: "text/plain", body: "Disposable submission intercepted" });
      });
      await click(pageObject(recovery).getByRole("button", { name: "Redefinir senha", exact: true }).filter({ visible: true }));
      await expect.poll(() => submission).toEqual({ navigation: true, method: "POST", passwordInQuery: false, passwordInBody: true });
    }
    finally { await plain.close(); }
  });

  await test.step("Acesso anônimo mantém recuperação e ação incompleta sem parâmetros e sem overflow", async () => {
    const originalViewport = page.viewportSize();
    // No happy path renders the retired-link status, so only this case proves its reflow.
    // Its text and links per mode belong to src/app/minha-conta/acao/page.test.tsx.
    for (const route of ["/minha-conta/recuperar-senha", "/minha-conta/acao"] as const) {
      await page.goto(route);
      expect(new URL(page.url()).search).toBe("");
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const main = pageObject(page).getByRole("main");
        if (route === "/minha-conta/recuperar-senha") {
          await expect(main.getByRole("heading", { name: "Recuperar acesso", exact: true })).toBeVisible();
        }
        else {
          await expect(main.getByRole("status")).toContainText("Este link anterior à mudança de acesso não funciona mais.");
        }
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    if (originalViewport) await page.setViewportSize(originalViewport);
  });

  await test.step("Modal de acesso troca modos pelo teclado e restaura a origem", async () => {
    await page.goto("/");
    const trigger = pageObject(page).getByRole("button", { name: "Entrar", exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = pageObject(page).getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Entre na sua conta", exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Email", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Não tem conta? Criar uma nova conta", exact: true }).press("Enter");
    await expect(dialog.getByRole("heading", { name: "Crie sua conta", exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Email", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Já tem conta? Fazer login", exact: true }).press("Enter");
    await expect(dialog.getByRole("heading", { name: "Entre na sua conta", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Esqueceu a senha?", exact: true }).press("Enter");
    await expect(dialog.getByRole("heading", { name: "Recuperar senha", exact: true })).toBeVisible();
    for (let tab = 0; tab < 6; tab++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  await test.step("Entrar e retornar à home", async () => {
    await page.goto("/");

    await loginPage.login(userCredentials.email, userCredentials.password);
    await expect(
      pageObject(page)
        .getByRole("button", { name: "Minha conta" })
        .filter({ visible: true }),
    ).toBeVisible();

    await expect(page).toHaveURL(url => url.pathname === "/");
  });

  await test.step("Abrir sidebar e verificar elementos do menu", async () => {
    await header.clickMyAccount();
    await expect(userSidebar.heading).toBeVisible();
    await expect
      .soft(userSidebar.getUserEmail(userCredentials.email))
      .toBeVisible();
    await expect.soft(userSidebar.myAdsLink).toBeVisible();
    await expect.soft(userSidebar.myProfilesLink).toBeVisible();
    await expect.soft(userSidebar.logoutButton).toBeVisible();
  });

  await test.step("A navegação por teclado começa em ação útil e retorna ao acionador", async () => {
    const trigger = pageObject(page).getByRole("button", { name: "Minha conta", exact: true }).filter({ visible: true });
    const firstLink = userSidebar.getByRole("link", { name: "Cadastre seu negócio ou serviço", exact: true });
    const secondLink = userSidebar.getByRole("link", { name: "Criar Anúncio", exact: true });

    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Space");
    await expect(firstLink).toBeFocused();
    const mobileCapture = testInfo.outputPath("account-menu-keyboard-mobile.png");
    await pageObject(page).getByRole("dialog", { name: "Minha Conta", exact: true }).screenshot({ path: mobileCapture });
    await testInfo.attach("account menu, keyboard focus, 390px", { path: mobileCapture, contentType: "image/png" });
    await page.keyboard.press("Tab");
    await expect(secondLink).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(firstLink).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.keyboard.press("Enter");
    await expect(firstLink).toBeFocused();
    const desktopCapture = testInfo.outputPath("account-menu-keyboard-desktop.png");
    await pageObject(page).getByRole("dialog", { name: "Minha Conta", exact: true }).screenshot({ path: desktopCapture });
    await testInfo.attach("account menu, keyboard focus, 1280px", { path: desktopCapture, contentType: "image/png" });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  await test.step("Navegar para Meus Anúncios", async () => {
    await userSidebar.clickMyAds();
    await expect(page).toHaveURL(
      url => url.pathname === "/minha-conta/anuncios",
    );
  });

  await test.step("Navegar para Meus Perfis", async () => {
    await page.goto("/");
    await userSidebar.open();
    await userSidebar.clickMyProfiles();
    await expect(page).toHaveURL(
      url => url.pathname === "/minha-conta/perfis",
    );
  });

  await test.step("Fazer logout com sucesso", async () => {
    await page.goto("/");
    const surface = pageObject(page);
    await expect(surface.getByRole("button", { name: "Minha conta", exact: true }).filter({ visible: true })).toBeVisible();
    await click(surface.getByRole("contentinfo").getByRole("link", { name: "Blog", exact: true }).filter({ visible: true }));
    await context.addCookies([{
      name: `ph_${SITE_SEARCH_FAKE_TOKEN}_posthog`,
      value: encodeURIComponent(JSON.stringify({ distinct_id: "e2e-stale-analytics-identity", $user_state: "anonymous" })),
      domain: new URL(test.info().project.use.baseURL!).hostname,
      path: "/", sameSite: "Lax",
    }]);
    await click(surface.getByRole("banner").getByRole("link", { name: "Tudo Macaé — página inicial", exact: true }));
    await userSidebar.open();
    await userSidebar.logout();

    await expect(
      pageObject(page)
        .getByRole("button", { name: "Entrar" })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      pageObject(page)
        .getByRole("button", { name: "Minha conta" })
        .filter({ visible: true }),
    ).not.toBeVisible();
    // Only the browser proves the server's deletion matches the cookie's attributes.
    await expect.poll(async () => (await context.cookies()).some(cookie => cookie.name === "session")).toBe(false);
  });

  await test.step("Recuperar a senha pelo link nativo e entrar na mesma conta", async () => {
    await click(
      pageObject(page)
        .getByRole("button", { name: "Entrar", exact: true })
        .filter({ visible: true }),
    );
    const dialog = pageObject(page)
      .getByRole("dialog")
      .filter({ visible: true });
    await click(
      dialog.getByRole("button", { name: "Esqueceu a senha?", exact: true }),
    );
    await dialog
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(userCredentials.email);
    await click(
      dialog.getByRole("button", {
        name: "Enviar email de recuperação",
        exact: true,
      }),
    );
    await expect(
      dialog.getByText(
        "Email de recuperação enviado! Verifique sua caixa de entrada.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.goto("/minha-conta/recuperar-senha");
    const email = pageObject(page).getByRole("textbox", {
      name: "Email",
      exact: true,
    });
    await email.fill(userCredentials.email);
    await email.press("Enter");
    await expect(pageObject(page).getByRole("status")).toContainText(
      "Email de recuperação enviado!",
    );
    const link = await readDisposablePasswordResetLink(userCredentials.email);
    await page.goto("/minha-conta/acao");
    await page.evaluate(url => window.location.assign(url), link);
    const password = makeTestPassword();
    await pageObject(page)
      .getByLabel("Nova Senha", { exact: true })
      .filter({ visible: true })
      .fill(password);
    await click(
      pageObject(page)
        .getByRole("button", { name: "Redefinir senha", exact: true })
        .filter({ visible: true }),
    );
    await expect(
      pageObject(page)
        .getByText("Você já pode entrar com sua nova senha.", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await page.goto("/");
    await loginPage.login(userCredentials.email, password);
    await header.clickMyAccount();
    await expect(userSidebar.getUserEmail(userCredentials.email)).toBeVisible();
    const session = await page.request.get("/api/autenticacao/sessao");
    expect(await session.json()).toMatchObject({ uid: userCredentials.uid });
  });
});
