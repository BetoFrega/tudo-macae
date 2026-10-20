import { expect, test, type Page } from "@playwright/test";
import { click } from "./_helpers/click";
import { pageObject } from "./_helpers/fixtures/POMs/pageObject";

const html = (body: string) => ({ contentType: "text/html; charset=utf-8", body });

async function serveOrigin(page: Page, body: string) {
  await page.route("**/origem", route => route.fulfill(html(body)));
  await page.route("**/destino", route => route.fulfill(html("<h1>Destino</h1>")));
  await page.goto("/origem");
}

const linkClicks = (page: Page) => page.evaluate(() => (window as { linkClicks?: number }).linkClicks ?? 0);

test("Link interno aguarda a navegação comum até o destino", async ({ page }) => {
  await serveOrigin(page, `<a href="/destino">Ir</a>`);
  await click(pageObject(page).getByRole("link", { name: "Ir", exact: true }));
  expect(new URL(page.url()).pathname).toBe("/destino");
  await expect(pageObject(page).getByRole("heading", { name: "Destino", exact: true })).toBeVisible();
});

test("Link interno repete o clique engolido antes da hidratação", async ({ page }) => {
  // The first click is swallowed, like a <Link> whose handler is not yet attached.
  await serveOrigin(page, `
    <a href="/destino" onclick="
      if (!sessionStorage.getItem('swallowed')) {
        sessionStorage.setItem('swallowed', 'yes');
        event.preventDefault();
      }
    ">Ir</a>
  `);
  await click(pageObject(page).getByRole("link", { name: "Ir", exact: true }));
  expect(new URL(page.url()).pathname).toBe("/destino");
  expect(await page.evaluate(() => sessionStorage.getItem("swallowed"))).toBe("yes");
});

test("Link interno aceita a navegação que chega depois da espera, sem clicar o link antigo", async ({ page }) => {
  // Client-side transition: the link stops being actionable at once, and the
  // destination replaces it after the helper's 2 s navigation wait has expired.
  await serveOrigin(page, `
    <a href="/destino" onclick="
      event.preventDefault();
      window.linkClicks = (window.linkClicks ?? 0) + 1;
      this.style.visibility = 'hidden';
      setTimeout(() => {
        history.pushState(null, '', '/destino');
        document.body.innerHTML = '<h1>Destino</h1>';
      }, 2500);
    ">Ir</a>
  `);
  await click(pageObject(page).getByRole("link", { name: "Ir", exact: true }));
  expect(new URL(page.url()).pathname).toBe("/destino");
  await expect(pageObject(page).getByRole("heading", { name: "Destino", exact: true })).toBeVisible();
  expect(await linkClicks(page)).toBe(1);
});

test("Link interno clica uma vez quando o documento de destino demora a responder", async ({ page }) => {
  await page.route("**/origem", route => route.fulfill(html(`<a href="/destino">Ir</a>`)));
  let destinationRequests = 0;
  await page.route("**/destino", async (route) => {
    destinationRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.fulfill(html("<h1>Destino</h1>"));
  });
  await page.goto("/origem");
  await click(pageObject(page).getByRole("link", { name: "Ir", exact: true }));
  expect(new URL(page.url()).pathname).toBe("/destino");
  await expect(pageObject(page).getByRole("heading", { name: "Destino", exact: true })).toBeVisible();
  expect(destinationRequests).toBe(1);
});

test("Link interno só aceita a chegada tardia depois do load do destino", async ({ page }) => {
  // The document arrives after the helper's first wait, and its `load` is held
  // back by an image well past the moment the arrival becomes visible.
  await page.route("**/origem", route => route.fulfill(html(`
    <a href="/destino" onclick="
      event.preventDefault();
      this.style.visibility = 'hidden';
      setTimeout(() => { location.href = '/destino'; }, 2500);
    ">Ir</a>
  `)));
  await page.route("**/destino", route => route.fulfill(html(`<h1>Destino</h1><img src="/lento.png" alt="">`)));
  await page.route("**/lento.png", async (route) => {
    await new Promise(resolve => setTimeout(resolve, 4000));
    await route.fulfill({ status: 204 });
  });
  await page.goto("/origem");
  await click(pageObject(page).getByRole("link", { name: "Ir", exact: true }));
  expect(new URL(page.url()).pathname).toBe("/destino");
  expect(await page.evaluate(() => document.readyState)).toBe("complete");
});

test("Link para a própria página clica uma vez sem esperar navegação", async ({ page }) => {
  await serveOrigin(page, `
    <a href="/origem#secao" onclick="window.linkClicks = (window.linkClicks ?? 0) + 1">Seção</a>
    <h2 id="secao">Seção</h2>
  `);
  await click(pageObject(page).getByRole("link", { name: "Seção", exact: true }));
  expect(new URL(page.url()).pathname).toBe("/origem");
  expect(await linkClicks(page)).toBe(1);
});
