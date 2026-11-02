import { pageObject } from "./_helpers/fixtures/POMs/pageObject";
import { expect, test } from "./_helpers/fixtures";

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
