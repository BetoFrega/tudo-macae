import type { Locator } from "@playwright/test";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { installUserSession } from "../_helpers/auth/helpers/authentication";
import {
  clearScriptedReplies,
  fakeUrl,
  headerSearch,
  releaseReply,
  scriptReply,
} from "../_helpers/siteSearch";
import { createClaimableProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";

// Resetting the fake also releases any reply a failed case left held.
test.afterEach(clearScriptedReplies);

const origin = "https://www.tudomacae.com.br";

async function replyProgress(query: string) {
  const response = await fetch(`${await fakeUrl()}/__replies?query=${encodeURIComponent(query)}`);
  expect(response.status).toBe(200);
  return await response.json() as { started: number; completed: number; businessStarted: number };
}

/** Position relative to the page's `main`, so header and banner height cannot move it. */
async function boxWithinMain(region: Locator) {
  return region.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top - element.closest("main")!.getBoundingClientRect().top, height: box.height };
  });
}

test("mantenedor busca pelo cabeçalho, filtra por tipo, compartilha a busca e abre o resultado", async ({
  browser, page, categoryFixture, userCredentials,
}) => {
  const title = `Padaria Busca ${makeRandomString()}`;
  const { id } = await createClaimableProfileFixture({
    title,
    description: "Pães artesanais no centro de Macaé.",
    contacts: [{ number: "22999999999", isWhatsapp: true }],
    activityAreas: [{ categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id }],
    sourceUrl: "https://example.com/site-search",
  });
  try {
    const path = businessCanonicalPath({ id, title });
    await scriptReply(title, {
      status: 200,
      body: {
        durationMs: 20,
        chunks: [
          { key: `${origin}${path}`, title, text: "## Pães artesanais\n\nFornadas todas as manhãs." },
          { key: `${origin}${path}`, title, text: "Segundo trecho da mesma página." },
          {
            key: `${origin}/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`,
            title: categoryFixture.category.name,
            text: "Negócios e anúncios desta categoria.",
          },
        ],
      },
    });
    await installUserSession(page, userCredentials);
    const filters = pageObject(page).getByRole("navigation", { name: "Filtrar por tipo" });
    const results = pageObject(page).getByRole("region", { name: `1 resultado para ${title}` });

    await test.step("a busca do cabeçalho abre /busca sem expor a consulta", async () => {
      await page.goto("/");
      const field = headerSearch(page).getByRole("searchbox", { name: "O que você procura?" });
      await field.fill(title);
      await field.press("Enter");
      await expect(page).toHaveURL(url => url.pathname === "/busca" && url.searchParams.get("q") === title);
      await expect(page).toHaveTitle("Buscar | Tudo Macaé");
      /* eslint-disable-next-line local/no-raw-playwright-page-selectors -- the referrer policy is a non-visible head tag. */
      await expect(page.locator("meta[name=\"referrer\"]")).toHaveAttribute("content", "origin");
    });

    await test.step("o filtro Negócios restringe os resultados", async () => {
      const everything = pageObject(page).getByRole("region", { name: `2 resultados para ${title}` });
      await expect(everything.getByRole("listitem")).toHaveCount(2);
      await expect(everything.getByText("Categoria", { exact: true })).toBeVisible();

      await click(filters.getByRole("link", { name: "Negócios", exact: true }));
      await expect(page).toHaveURL(url => url.searchParams.get("tipo") === "negocios" && url.searchParams.get("q") === title);
      await expect(results.getByRole("listitem")).toHaveCount(1);
      await expect(results.getByText("Pães artesanais Fornadas todas as manhãs.", { exact: true })).toBeVisible();
      await expect(results.getByText("Negócio", { exact: true })).toBeVisible();
      await expect(filters.getByRole("link", { name: "Negócios", exact: true })).toHaveAttribute("aria-current", "page");
    });

    await test.step("o endereço compartilhado reabre a mesma busca", async () => {
      const shared = await browser.newContext();
      try {
        const sharedPage = await shared.newPage();
        await installUserSession(sharedPage, userCredentials);
        await sharedPage.goto(page.url());
        await expect(pageObject(sharedPage).getByRole("region", { name: `1 resultado para ${title}` })).toBeVisible();
        await expect(pageObject(sharedPage).getByRole("main").getByRole("searchbox", { name: "O que você procura?" }))
          .toHaveValue(title);
      }
      finally {
        await shared.close();
      }
    });

    await test.step("o resultado abre o negócio enviando só a origem como Referer", async () => {
      // Client navigation fetches the destination as RSC; the Referer must be the bare origin.
      const opened = page.waitForRequest(request => new URL(request.url()).pathname === path);
      await click(results.getByRole("link", { name: title, exact: true }));
      expect(await (await opened).headerValue("referer")).toBe(`${new URL(page.url()).origin}/`);
      await expect(page).toHaveURL(url => url.pathname === path);
      await expect(pageObject(page).getByRole("heading", { level: 1, name: title })).toBeVisible();
      /* eslint-disable-next-line local/no-raw-playwright-page-selectors -- the index reads this non-visible head tag. */
      await expect(page.locator("meta[name=\"search_result_type\"]")).toHaveAttribute("content", "business");
    });
  }
  finally {
    await deleteProfileFixture(id);
  }
});

test("uma consulta nova substitui a busca retida sem mostrar a resposta antiga nem deslocar os resultados", async ({
  page, userCredentials,
}) => {
  const slowQuery = `busca em andamento ${makeRandomString()}`;
  const nextQuery = `consulta nova ${makeRandomString()}`;
  const staleTitle = `Resposta antiga ${makeRandomString()}`;
  await scriptReply(slowQuery, {
    status: 200,
    held: true,
    body: { durationMs: 20, chunks: [{
      key: `${origin}/negocio/e2e/resposta-antiga`,
      title: staleTitle,
      text: "Este resultado não deve substituir uma consulta mais nova.",
    }] },
  });
  await scriptReply(nextQuery, {
    status: 200,
    body: { durationMs: 20, chunks: [{
      key: `${origin}/negocio/e2e/busca-atualizada`,
      title: "Busca atualizada",
      text: "A nova consulta foi concluída.",
    }] },
  });
  await installUserSession(page, userCredentials);
  const main = pageObject(page).getByRole("main");
  const searchField = main.getByRole("searchbox", { name: "O que você procura?" });
  let loadingBox: { top: number; height: number } | undefined;

  await test.step("a consulta lenta mostra o carregamento e a filtragem continua disponível", async () => {
    await page.goto("/");
    const headerField = headerSearch(page).getByRole("searchbox", { name: "O que você procura?" });
    await headerField.fill(slowQuery);
    await Promise.all([
      page.waitForURL(url => url.pathname === "/busca" && url.searchParams.get("q") === slowQuery, { waitUntil: "commit" }),
      headerField.press("Enter"),
    ]);
    await expect(main.getByRole("status").filter({ visible: true })).toHaveText("Buscando…");
    await expect(searchField).toHaveValue(slowQuery);
    loadingBox = await boxWithinMain(main.getByRole("region", { name: "Resultados da busca" }));

    // The filter is a client navigation, so its held reply can still reach the router after the next query.
    const businesses = main.getByRole("navigation", { name: "Filtrar por tipo" }).getByRole("link", { name: "Negócios", exact: true });
    await click(businesses);
    await page.waitForURL(url => url.searchParams.get("q") === slowQuery && url.searchParams.get("tipo") === "negocios", { waitUntil: "commit" });
    // The form that carries the filter into the next query has rendered.
    await expect(businesses).toHaveAttribute("aria-current", "page");
    await expect.poll(async () => {
      const progress = await replyProgress(slowQuery);
      return progress.businessStarted > 0 && progress.completed === 0;
    }, { message: "A resposta filtrada antiga está retida no provedor" }).toBe(true);
  });

  const finalResults = main.getByRole("region", { name: `1 resultado para ${nextQuery}` });
  await test.step("a consulta nova aparece e a resposta antiga liberada depois não aparece", async () => {
    await searchField.fill(nextQuery);
    await searchField.press("Enter");
    await expect(finalResults.getByRole("link", { name: "Busca atualizada" })).toBeVisible();

    await releaseReply(slowQuery);
    await expect.poll(async () => {
      const progress = await replyProgress(slowQuery);
      return progress.started > 0 && progress.completed === progress.started;
    }, { timeout: 15_000, message: "Aguardar todas as respostas da consulta antiga no provedor" }).toBe(true);

    await expect(page).toHaveURL(url => url.searchParams.get("q") === nextQuery && url.searchParams.get("tipo") === "negocios");
    await expect(finalResults.getByRole("link", { name: "Busca atualizada" })).toBeVisible();
    await expect(main.getByText(staleTitle, { exact: true })).toHaveCount(0);
  });

  await test.step("a região de resultados mantém posição e altura entre carregamento e resultado", async () => {
    expect(await boxWithinMain(finalResults)).toEqual(loadingBox);
  });
});
