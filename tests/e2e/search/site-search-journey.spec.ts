import { readFile } from "node:fs/promises";
import type { CDPSession } from "@playwright/test";
import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { E2E_SERVER_LOG_PATH } from "../../../bin/e2eStack";
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
test.afterEach(clearScriptedReplies);

function lowercaseHeaders(headers: Record<string, string>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

function isBusinessSearch(url: URL, query: string) {
  return url.searchParams.get("q") === query && url.searchParams.get("tipo") === "negocios";
}

function isBusinessRscNavigation(url: URL, headers: Record<string, string | undefined>, query: string) {
  return isBusinessSearch(url, query)
    && headers.rsc === "1" && !headers["next-router-prefetch"] && !headers["next-router-segment-prefetch"];
}

function isBusinessDocumentNavigation(type: string | undefined, url: URL, headers: Record<string, string | undefined>, query: string) {
  return type === "Document" && isBusinessSearch(url, query) && !headers.rsc;
}

test("mantenedor busca pelo cabeçalho, filtra por tipo e compartilha a busca", async ({
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
  let heldQuery: string | undefined;
  let oldNavigationSession: CDPSession | undefined;
  const testFailures: unknown[] = [];
  try {
    const path = businessCanonicalPath({ id, title });
    const key = `https://www.tudomacae.com.br${path}`;
    await scriptReply(title, {
      status: 200,
      body: {
        durationMs: 20,
        chunks: [
          { key, title, text: "## Pães artesanais\n\nFornadas todas as manhãs." },
          { key, title, text: "Segundo trecho da mesma página." },
          {
            key: `https://www.tudomacae.com.br/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`,
            title: categoryFixture.category.name,
            text: "Negócios e anúncios desta categoria.",
          },
        ],
      },
    });
    await installUserSession(page, userCredentials);

    await page.goto("/");
    const field = headerSearch(page).getByRole("searchbox", { name: "O que você procura?" });
    await field.fill(title);
    await field.press("Enter");
    await expect(page).toHaveURL(url => url.pathname === "/busca" && url.searchParams.get("q") === title);
    await expect(page).toHaveTitle("Buscar | Tudo Macaé");
    /* eslint-disable-next-line local/no-raw-playwright-page-selectors -- the referrer policy is a non-visible head tag. */
    await expect(page.locator("meta[name=\"referrer\"]")).toHaveAttribute("content", "origin");

    const everything = pageObject(page).getByRole("region", { name: `2 resultados para ${title}` });
    await expect(everything.getByRole("listitem")).toHaveCount(2);
    await expect(everything.getByText("Categoria", { exact: true })).toBeVisible();

    const filters = pageObject(page).getByRole("navigation", { name: "Filtrar por tipo" });
    await click(filters.getByRole("link", { name: "Negócios", exact: true }));
    await expect(page).toHaveURL(url => url.searchParams.get("tipo") === "negocios" && url.searchParams.get("q") === title);
    const results = pageObject(page).getByRole("region", { name: `1 resultado para ${title}` });
    await expect(results.getByRole("listitem")).toHaveCount(1);
    await expect(results.getByText("Pães artesanais Fornadas todas as manhãs.", { exact: true })).toBeVisible();
    await expect(results.getByText("Negócio", { exact: true })).toBeVisible();
    await expect(filters.getByRole("link", { name: "Negócios", exact: true })).toHaveAttribute("aria-current", "page");

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

    // Client navigation fetches the destination as RSC; the Referer must be the bare origin.
    const opened = page.waitForRequest(request => new URL(request.url()).pathname === path);
    await click(results.getByRole("link", { name: title, exact: true }));
    expect(await (await opened).headerValue("referer")).toBe(`${new URL(page.url()).origin}/`);
    await expect(page).toHaveURL(url => url.pathname === path);
    await expect(pageObject(page).getByRole("heading", { level: 1, name: title })).toBeVisible();
    /* eslint-disable-next-line local/no-raw-playwright-page-selectors -- the index reads this non-visible head tag. */
    await expect(page.locator("meta[name=\"search_result_type\"]")).toHaveAttribute("content", "business");

    const log = await readFile(E2E_SERVER_LOG_PATH, "utf8");
    expect(log).toMatch(/"event":"site_search".*"outcome":"results","filter":"businesses","resultCount":1/u);
    expect(log).not.toContain(title);
    expect(log).not.toContain(encodeURIComponent(title));

    const slowQuery = `busca em andamento ${makeRandomString()}`;
    const nextQuery = `consulta nova ${makeRandomString()}`;
    const staleTitle = `Resposta antiga ${makeRandomString()}`;
    heldQuery = slowQuery;
    await scriptReply(slowQuery, {
      status: 200,
      held: true,
      body: { durationMs: 20, chunks: [{
        key,
        title: staleTitle,
        text: "Este resultado não deve substituir uma consulta mais nova.",
      }] },
    });
    await scriptReply(nextQuery, {
      status: 200,
      body: { durationMs: 20, chunks: [{
        key,
        title: "Busca atualizada",
        text: "A nova consulta foi concluída.",
      }] },
    });

    const headerField = headerSearch(page).getByRole("searchbox", { name: "O que você procura?" });
    await headerField.fill(slowQuery);
    const slowNavigation = page.waitForURL(url => url.pathname === "/busca" && url.searchParams.get("q") === slowQuery, { waitUntil: "commit" });
    await Promise.all([slowNavigation, headerField.press("Enter")]);

    const main = pageObject(page).getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Buscar no Tudo Macaé" })).toBeVisible();
    const searchField = main.getByRole("searchbox", { name: "O que você procura?" });
    await expect(searchField).toHaveValue(slowQuery);
    const pendingFilters = main.getByRole("navigation", { name: "Filtrar por tipo" });
    await expect(pendingFilters.getByRole("link", { name: "Negócios", exact: true })).toBeEnabled();
    const status = main.getByRole("status").filter({ visible: true });
    await expect(status).toHaveText("Buscando…");
    await searchField.focus();
    await expect(status).toHaveText("A busca está levando mais tempo que o normal. Você ainda pode ajustar sua busca.", { timeout: 5_000 });
    await expect(searchField).toHaveValue(slowQuery);
    await expect(searchField).toBeFocused();
    const resultsTopWhileLoading = await main.getByRole("region", { name: "Resultados da busca" })
      .evaluate(region => region.getBoundingClientRect().top + window.scrollY);
    const resultsHeightWhileLoading = await main.getByRole("region", { name: "Resultados da busca" })
      .evaluate(region => region.getBoundingClientRect().height);
    await page.screenshot({ path: test.info().outputPath("site-search-loading-desktop.png"), fullPage: true });

    const oldRequests = new Map<string, string>();
    const oldResponses = new Set<string>();
    const newDocuments = new Map<string, string>();
    const documentNavigations = new Map<string, { loaderId: string; url: string }>();
    const defaultContexts = new Map<string, { id: number; uniqueId: string }>();
    let sessionDisconnected = false;
    oldNavigationSession = await page.context().newCDPSession(page);
    const { frameTree } = await oldNavigationSession.send("Page.getFrameTree");
    const oldLoaderId = frameTree.frame.loaderId as string;
    const mainFrameId = frameTree.frame.id as string;
    expect(oldLoaderId).toBeTruthy();
    oldNavigationSession.on("close", () => {
      sessionDisconnected = true;
    });
    oldNavigationSession.on("Page.frameNavigated", ({ frame }) => {
      documentNavigations.set(frame.id, { loaderId: frame.loaderId, url: frame.url });
    });
    oldNavigationSession.on("Runtime.executionContextCreated", ({ context }) => {
      if (context.auxData?.isDefault) {
        defaultContexts.set(context.auxData.frameId, { id: context.id, uniqueId: context.uniqueId });
      }
    });
    oldNavigationSession.on("Network.requestWillBeSent", ({ requestId, request, frameId, loaderId, type }) => {
      const url = new URL(request.url);
      const headers = lowercaseHeaders(request.headers);
      if (frameId !== mainFrameId || url.pathname !== "/busca") return;
      if (isBusinessRscNavigation(url, headers, slowQuery)) oldRequests.set(requestId, loaderId);
      if (isBusinessDocumentNavigation(type, url, headers, nextQuery)) newDocuments.set(requestId, loaderId);
    });
    oldNavigationSession.on("Network.responseReceived", ({ requestId, response }) => {
      if (response.mimeType === "text/x-component" && !response.fromServiceWorker) oldResponses.add(requestId);
    });
    await oldNavigationSession.send("Page.enable");
    await oldNavigationSession.send("Runtime.enable");
    await oldNavigationSession.send("Network.enable");

    await click(pendingFilters.getByRole("link", { name: "Negócios", exact: true }));
    await page.waitForURL(url => url.pathname === "/busca" && url.searchParams.get("q") === slowQuery && url.searchParams.get("tipo") === "negocios", { waitUntil: "commit" });
    await expect(main.getByRole("searchbox", { name: "O que você procura?" })).toHaveValue(slowQuery);
    await expect(main.getByRole("navigation", { name: "Filtrar por tipo" }).getByRole("link", { name: "Negócios", exact: true }))
      .toHaveAttribute("aria-current", "page");

    await expect.poll(() => oldRequests.size, { message: "Identificar uma única navegação antiga sem prefetch" }).toBe(1);
    const [oldRequestId] = oldRequests.keys();
    if (!oldRequestId) throw new Error("A navegação antiga não foi observada");
    await expect.poll(() => oldResponses.has(oldRequestId), { message: "A resposta RSC antiga começou no navegador" }).toBe(true);
    await expect.poll(async () => {
      const response = await fetch(`${await fakeUrl()}/__replies?query=${encodeURIComponent(slowQuery)}`);
      const progress = await response.json() as { businessStarted: number; completed: number };
      return progress.businessStarted > 0 && progress.completed === 0;
    }, { message: "A resposta filtrada antiga permanece retida no provedor" }).toBe(true);
    expect(oldRequests.get(oldRequestId)).toBe(oldLoaderId);
    await expect.poll(() => defaultContexts.get(mainFrameId)?.uniqueId).toBeTruthy();
    const oldContext = defaultContexts.get(mainFrameId)!;
    const oldDocumentTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    const filteredField = main.getByRole("searchbox", { name: "O que você procura?" });
    await filteredField.fill(nextQuery);
    const nextNavigation = page.waitForURL(url => url.pathname === "/busca" && url.searchParams.get("q") === nextQuery && url.searchParams.get("tipo") === "negocios", { waitUntil: "commit" });
    await Promise.all([nextNavigation, filteredField.press("Enter")]);
    const finalResults = pageObject(page).getByRole("region", { name: `1 resultado para ${nextQuery}` });
    await expect(finalResults.getByRole("link", { name: "Busca atualizada" })).toBeVisible();
    await expect(pageObject(page).getByRole("status").filter({ visible: true })).toHaveText("1 resultado encontrado");
    await expect.poll(() => newDocuments.size, { message: "A nova consulta faz uma navegação GET de documento" }).toBe(1);
    const [newLoaderId] = newDocuments.values();
    expect(newLoaderId).toBeTruthy();
    expect(newLoaderId).not.toBe(oldLoaderId);
    await expect.poll(() => documentNavigations.get(mainFrameId)?.loaderId).toBe(newLoaderId);
    expect(new URL(documentNavigations.get(mainFrameId)!.url).searchParams.get("q")).toBe(nextQuery);
    await expect.poll(() => defaultContexts.get(mainFrameId)?.uniqueId).not.toBe(oldContext.uniqueId);
    const newContext = defaultContexts.get(mainFrameId)!;
    expect(newContext.uniqueId).toBeTruthy();
    const newDocumentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    expect(newDocumentTimeOrigin).not.toBe(oldDocumentTimeOrigin);
    const contextTimeOrigin = await oldNavigationSession.send("Runtime.evaluate", {
      expression: "performance.timeOrigin",
      contextId: newContext.id,
      returnByValue: true,
    });
    expect(contextTimeOrigin.result.value).toBe(newDocumentTimeOrigin);
    expect(sessionDisconnected).toBe(false);
    await releaseReply(slowQuery);
    await expect.poll(async () => {
      const response = await fetch(`${await fakeUrl()}/__replies?query=${encodeURIComponent(slowQuery)}`);
      expect(response.status).toBe(200);
      const progress = await response.json() as { started: number; completed: number };
      return progress.started > 0 && progress.completed === progress.started;
    }, { timeout: 15_000, message: "Aguardar todas as respostas da consulta antiga no provedor" }).toBe(true);
    expect(sessionDisconnected).toBe(false);
    expect(documentNavigations.get(mainFrameId)?.loaderId).toBe(newLoaderId);
    expect(defaultContexts.get(mainFrameId)?.uniqueId).toBe(newContext.uniqueId);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(newDocumentTimeOrigin);
    await expect(finalResults.getByRole("link", { name: "Busca atualizada" })).toBeVisible();
    await expect(page).toHaveURL(url => url.searchParams.get("q") === nextQuery && url.searchParams.get("tipo") === "negocios");
    await expect(pageObject(page).getByRole("main").getByText(staleTitle, { exact: true })).toHaveCount(0);
    const resultsTopAfterLoading = await finalResults.evaluate(region => region.getBoundingClientRect().top + window.scrollY);
    const resultsHeightAfterLoading = await finalResults.evaluate(region => region.getBoundingClientRect().height);
    expect(resultsTopAfterLoading).toBe(resultsTopWhileLoading);
    expect(resultsHeightAfterLoading).toBe(resultsHeightWhileLoading);
    await page.screenshot({ path: test.info().outputPath("site-search-loaded-desktop.png"), fullPage: true });
  }
  catch (error) {
    testFailures.push(error);
    throw error;
  }
  finally {
    const cleanupFailures: unknown[] = [];
    for (const cleanup of [
      async () => { if (heldQuery) await releaseReply(heldQuery); },
      async () => { await oldNavigationSession?.detach(); },
      async () => { await deleteProfileFixture(id); },
    ]) {
      try {
        await cleanup();
      }
      catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [...testFailures, ...cleanupFailures],
        "Site search fixture cleanup failed",
      );
    }
  }
});
