import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { expect, test } from "../_helpers/fixtures";

const sessionPath = "/api/autenticacao/sessao";
const reminderPath = "/api/autenticacao/lembrete";

test("A fixture de sessão espera a leitura inicial da pendência antes de liberar navegação", async ({ page, userWithClaims }) => {
  let reminderRequestFinished = false;
  await page.route(`**${reminderPath}**`, async (route) => {
    const request = route.request();
    expect(request.method()).toBe("GET");
    expect(request.postData()).toBeNull();
    expect(request.headers()["next-action"]).toBeUndefined();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ response });
    reminderRequestFinished = true;
  }, { times: 1 });
  await userWithClaims({});
  expect(reminderRequestFinished).toBe(true);
  await expect(pageObject(page).getByRole("complementary", { name: "Pendência da conta", exact: true })).toBeVisible();
  await page.goto("/minha-conta/anuncios");
});

test("Retomar a aba preserva a identidade durante uma falha e permite nova sincronização", async ({ page, loginPage, userCredentials, userSidebar }) => {
  let failRefresh = false;
  await page.route(`**${sessionPath}`, async (route) => {
    if (failRefresh) await route.abort("failed");
    else await route.continue();
  });
  await page.goto("/");
  await loginPage.login(userCredentials.email, userCredentials.password);
  const account = pageObject(page).getByRole("button", { name: "Minha conta", exact: true }).filter({ visible: true });
  await expect(account).toBeVisible();

  for (const trigger of ["focus", "visibilitychange"]) {
    await test.step(`${trigger} tolera uma falha e se recupera com GET sem corpo`, async () => {
      failRefresh = true;
      const failed = page.waitForEvent("requestfailed", request => new URL(request.url()).pathname === sessionPath);
      const reported = page.waitForEvent("console", message => message.text().includes("authentication.session.refresh_failed"));
      await page.evaluate((event) => {
        if (event === "focus") window.dispatchEvent(new Event(event));
        else document.dispatchEvent(new Event(event));
      }, trigger);
      await failed;
      expect(JSON.parse((await reported).text())).toMatchObject({ failureCategory: "transport", trigger: "background_refresh" });
      await expect(account).toBeVisible();
      await expect(pageObject(page).getByRole("heading", { name: "Algo deu errado", exact: true })).toHaveCount(0);

      failRefresh = false;
      const synchronized = page.waitForResponse(response => new URL(response.url()).pathname === sessionPath);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      const response = await synchronized;
      expect(response.request().method()).toBe("GET");
      expect(response.request().postData()).toBeNull();
      expect(response.request().headers()["next-action"]).toBeUndefined();
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect((await response.json()).uid).toBeTruthy();
      await expect(account).toBeVisible();
    });
  }
  await userSidebar.open();
  await userSidebar.logout();
  await expect(pageObject(page).getByRole("button", { name: "Entrar", exact: true }).filter({ visible: true })).toBeVisible();
  const synchronized = page.waitForResponse(response => new URL(response.url()).pathname === sessionPath);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(await (await synchronized).json()).toBeNull();
});
