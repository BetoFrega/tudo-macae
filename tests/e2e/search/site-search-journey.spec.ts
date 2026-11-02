import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { installUserSession } from "../_helpers/auth/helpers/authentication";
import { clearScriptedReplies, headerSearch, scriptReply } from "../_helpers/siteSearch";
import { createClaimableProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";

test.afterEach(clearScriptedReplies);

const origin = "https://www.tudomacae.com.br";

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
