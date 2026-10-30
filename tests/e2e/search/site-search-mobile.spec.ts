import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { installUserSession } from "../_helpers/auth/helpers/authentication";
import { clearScriptedReplies, scriptReply } from "../_helpers/siteSearch";

test.afterEach(clearScriptedReplies);

test("no celular, a busca opera por teclado e mostra resultado e busca vazia sem rolagem horizontal", async ({ page, userCredentials }) => {
  const query = `busca móvel ${makeRandomString()}`;
  await scriptReply(query, {
    status: 200,
    body: { durationMs: 20, chunks: [{
      key: "https://www.tudomacae.com.br/negocios",
      title: "Resultado no celular",
      text: "A busca terminou sem deslocar o formulário.",
    }] },
  });
  await installUserSession(page, userCredentials);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto("/");
  await click(pageObject(page).getByRole("banner").getByRole("link", { name: "Buscar no Tudo Macaé" }).filter({ visible: true }));
  await expect(page).toHaveURL(url => url.pathname === "/busca" && !url.search);

  const main = pageObject(page).getByRole("main");
  const field = main.getByRole("searchbox", { name: "O que você procura?" });
  await field.focus();
  await page.keyboard.type(query);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === "/busca" && url.searchParams.get("q") === query);
  await expect(main.getByRole("region", { name: `1 resultado para ${query}` })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1, name: "Buscar no Tudo Macaé" })).toBeVisible();
  await expect(main.getByRole("searchbox", { name: "O que você procura?" })).toHaveValue(query);
  await expect(main.getByRole("navigation", { name: "Filtrar por tipo" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("site-search-loaded-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The fake answers an unscripted query with no chunks.
  const empty = `sem resultado ${makeRandomString()}`;
  await field.fill(empty);
  await field.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === "/busca" && url.searchParams.get("q") === empty);
  await expect(main.getByRole("heading", { name: `Nada encontrado para ${empty}` })).toBeVisible();
  await expect(main.getByRole("link", { name: "Explorar o catálogo de negócios" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
