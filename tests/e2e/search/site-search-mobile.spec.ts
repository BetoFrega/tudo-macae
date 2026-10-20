import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { installUserSession } from "../_helpers/auth/helpers/authentication";
import { clearScriptedReplies, enableSearchAudience, scriptReply } from "../_helpers/siteSearch";

test.afterEach(clearScriptedReplies);

test("no celular, a busca opera por teclado e separa vazio de indisponibilidade", async ({ page, userCredentials }) => {
  const empty = `sem resultado ${makeRandomString()}`;
  const exhausted = `limite ${makeRandomString()}`;
  const slow = `busca móvel ${makeRandomString()}`;
  await scriptReply(slow, {
    status: 200,
    delayMs: 1_500,
    body: { durationMs: 20, chunks: [{
      key: "https://www.tudomacae.com.br/negocios",
      title: "Resultado no celular",
      text: "A busca terminou sem deslocar o formulário.",
    }] },
  });
  await scriptReply(exhausted, { status: 429, delayMs: 1_500, body: { error: "quota" } });
  await enableSearchAudience(userCredentials.uid);
  await installUserSession(page, userCredentials);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.goto("/");
  await click(pageObject(page).getByRole("banner").getByRole("link", { name: "Buscar no Tudo Macaé" }).filter({ visible: true }));
  await expect(page).toHaveURL(url => url.pathname === "/busca" && !url.search);

  const field = pageObject(page).getByRole("main").getByRole("searchbox", { name: "O que você procura?" });
  await field.focus();
  await page.keyboard.type(empty);
  await page.keyboard.press("Enter");
  await expect(pageObject(page).getByRole("heading", { name: `Nada encontrado para ${empty}` })).toBeVisible();
  await expect(pageObject(page).getByRole("link", { name: "Explorar o catálogo de negócios" })).toBeVisible();

  await field.fill(exhausted);
  const exhaustedNavigation = page.waitForURL(url => url.pathname === "/busca" && url.searchParams.get("q") === exhausted, { waitUntil: "commit" });
  await Promise.all([exhaustedNavigation, page.keyboard.press("Enter")]);
  await expect(pageObject(page).getByRole("status").filter({ visible: true })).toHaveText("Buscando…");
  await expect(pageObject(page).getByRole("searchbox", { name: "O que você procura?" })).toHaveValue(exhausted);
  await expect(pageObject(page).getByRole("heading", { name: "Não foi possível buscar agora" })).toBeVisible();
  await expect(pageObject(page).getByRole("status"))
    .toHaveText("Não foi possível buscar agora. A busca atingiu o limite de uso por enquanto.");
  await expect(pageObject(page).getByRole("link", { name: "Explorar o catálogo de negócios" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await field.fill(slow);
  const slowNavigation = page.waitForURL(url => url.pathname === "/busca" && url.searchParams.get("q") === slow, { waitUntil: "commit" });
  await Promise.all([slowNavigation, field.press("Enter")]);
  const main = pageObject(page).getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Buscar no Tudo Macaé" })).toBeVisible();
  await expect(main.getByRole("searchbox", { name: "O que você procura?" })).toHaveValue(slow);
  await expect(main.getByRole("navigation", { name: "Filtrar por tipo" })).toBeVisible();
  await expect(main.getByRole("status").filter({ visible: true })).toHaveText("Buscando…");
  const reducedMotionAnimation = await main.getByRole("region", { name: "Resultados da busca" }).evaluate((region) => {
    const placeholder = region.querySelector("ol li div");
    return placeholder ? getComputedStyle(placeholder).animationName : null;
  });
  expect(reducedMotionAnimation).toBe("none");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("site-search-loading-mobile.png") });
  await expect(main.getByRole("region", { name: `1 resultado para ${slow}` })).toBeVisible();
  await expect(main.getByRole("heading", { level: 1, name: "Buscar no Tudo Macaé" })).toBeVisible();
  await expect(main.getByRole("searchbox", { name: "O que você procura?" })).toHaveValue(slow);
  await expect(main.getByRole("navigation", { name: "Filtrar por tipo" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("site-search-loaded-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
