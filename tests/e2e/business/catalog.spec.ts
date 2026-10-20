import { expect, test } from "../_helpers/fixtures";
import { click } from "../_helpers/click";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { makeRandomString } from "../../_helpers/makeRandomString";
import { createClaimableProfileFixture, createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { slugify } from "@tudomacae/text-normalization/slugify";

test("visitante encontra Negócios por categoria em páginas limitadas", async ({
  context,
  page,
  request,
  homePage,
  categoryFixture,
  userCredentials,
}) => {
  const suffix = makeRandomString();
  const prefix = `Catálogo ${suffix}`;
  const area = {
    categoryId: categoryFixture.category.id,
    subcategoryId: categoryFixture.subcategory.id,
  };
  const profileIds: string[] = [];
  const externalRoutePattern = "https://referrer-target.test/**";
  let externalRouteInstalled = false;
  const createdBusinesses: { id: string; title: string }[] = [];
  try {
    const claimableTitle = `${prefix} 00`;
    const { id: claimableId } = await createClaimableProfileFixture({
      title: claimableTitle,
      description: "Informações públicas de um negócio local.",
      contacts: [{ number: "22999999999", isWhatsapp: true }],
      activityAreas: [area],
      sourceUrl: "https://example.com/catalog-test",
    });
    profileIds.push(claimableId);
    createdBusinesses.push({ id: claimableId, title: claimableTitle });
    const additionalBusinesses = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const title = `${prefix} ${String(index + 1).padStart(2, "0")}`;
      const id = await createProfileFixture(userCredentials, {
        title,
        description: "Negócio local para o teste do catálogo.",
        contacts: [{ number: "22888888888", isWhatsapp: false }],
        activityAreas: [area],
      });
      return { id, title };
    }));
    createdBusinesses.push(...additionalBusinesses);
    profileIds.push(...additionalBusinesses.map(business => business.id));

    await homePage.open();
    const discoveryHeading = pageObject(page).getByRole("heading", {
      name: "Encontre em Macaé",
      exact: true,
    }).filter({ visible: true });
    await expect(discoveryHeading).toHaveCount(1);
    const discovery = pageObject(page).locator("section").filter({ has: discoveryHeading });
    await expect(discovery.getByRole("navigation", {
      name: "Categorias de negócios e anúncios",
    })).toBeVisible();
    await click(discovery.getByText(categoryFixture.category.name, { exact: true }));
    await click(discovery.getByRole("link", {
      name: `Ver tudo em ${categoryFixture.category.name}`,
      exact: true,
    }));
    await expect(page).toHaveURL(new RegExp(
      `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}$`,
    ));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/negocios");
    await click(pageObject(page).getByText("Explorar categorias", { exact: true }));
    const catalogCategoryLink = pageObject(page).getByRole("link", {
      name: categoryFixture.category.name,
      exact: true,
    });
    await click(catalogCategoryLink);
    await expect(page).toHaveURL(new RegExp(
      `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}$`,
    ));

    await page.goto("/negocios");
    await click(pageObject(page).getByText("Explorar categorias", { exact: true }));
    await click(pageObject(page).getByRole("button", {
      name: `Mostrar subcategorias de ${categoryFixture.category.name}`,
      exact: true,
    }));
    await click(pageObject(page).getByRole("link", {
      name: categoryFixture.subcategory.name,
      exact: true,
    }));
    await expect(page).toHaveURL(new RegExp(
      `/negocios\\?.*subcategoria=${categoryFixture.subcategory.id}.*#business-results-title$`,
    ));
    await expect(pageObject(page).getByRole("heading", {
      name: `Negócios de ${categoryFixture.subcategory.name}`,
      exact: true,
    })).toBeInViewport();
    await expect(pageObject(page).locator("details").filter({
      hasText: "Explorar categorias",
    })).toHaveJSProperty("open", false);
    await expect(pageObject(page).locator("article").filter({
      has: pageObject(page).getByRole("link", { name: `${prefix} 00`, exact: true }),
    })).toBeInViewport();
    await expect(pageObject(page).locator("article")).toHaveCount(20);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/negocios");
    await click(pageObject(page).getByRole("button", {
      name: `Mostrar subcategorias de ${categoryFixture.category.name}`,
      exact: true,
    }));
    await click(pageObject(page).getByRole("link", {
      name: categoryFixture.subcategory.name,
      exact: true,
    }));
    await expect(page).toHaveURL(new RegExp(
      `/negocios\\?.*subcategoria=${categoryFixture.subcategory.id}.*#business-results-title$`,
    ));
    const results = pageObject(page).getByRole("region", { name: "Resultados" }).or(
      pageObject(page).locator("section").filter({ has: pageObject(page).getByRole("heading", { name: `Negócios de ${categoryFixture.subcategory.name}` }) }),
    );
    await expect(results.locator("article")).toHaveCount(20);
    await expect(pageObject(page).getByText("20 negócios exibidos", { exact: true })).toBeVisible();
    const loadMoreButton = pageObject(page).getByRole("button", {
      name: "Carregar mais negócios",
      exact: true,
    });
    await loadMoreButton.scrollIntoViewIfNeeded();
    const scrollBeforeLoading = await page.evaluate(() => window.scrollY);
    expect(scrollBeforeLoading).toBeGreaterThan(0);
    await click(loadMoreButton);
    await expect(results.locator("article")).toHaveCount(21);
    await expect(pageObject(page).getByText("21 negócios exibidos", { exact: true })).toBeVisible();
    const scrollAfterLoading = await page.evaluate(() => window.scrollY);
    expect(scrollAfterLoading).toBeGreaterThanOrEqual(scrollBeforeLoading - 100);
    await expect(pageObject(page).getByRole("button", { name: "Carregar mais negócios" }))
      .not.toBeVisible();

    const canonicalPath = `/negocio/${claimableId}/${slugify(`${prefix} 00`)}`;
    const openedBusiness = page.waitForRequest(request => new URL(request.url()).pathname === canonicalPath);
    await click(pageObject(page).getByRole("link", { name: `${prefix} 00` }));
    expect(await (await openedBusiness).headerValue("referer")).toBe(`${new URL(page.url()).origin}/`);
    await expect(page).toHaveURL(new RegExp(`${canonicalPath}$`));
    // eslint-disable-next-line local/no-raw-playwright-page-selectors -- Metadata is deliberately hidden from the visible-tree page object.
    await expect(page.locator(`link[rel="canonical"][href$="${canonicalPath}"]`)).toHaveAttribute("href", new RegExp(`${canonicalPath}$`));
    await expect(pageObject(page).getByText("Informações públicas", { exact: true })).toBeVisible();
    const contact = pageObject(page).getByRole("main").getByRole("link", {
      name: "WhatsApp (22) 99999-9999", exact: true,
    });
    await expect(contact).toHaveAttribute("href", /^https:\/\/wa\.me\//u);

    await page.goBack();
    await expect(results.locator("article")).toHaveCount(21);
    await expect(pageObject(page).getByText("21 negócios exibidos", { exact: true })).toBeVisible();
    await click(pageObject(page).getByRole("link", { name: `${prefix} 00` }));

    const stale = await request.get(`/negocio/${claimableId}/nome-antigo`, { maxRedirects: 0 });
    expect(stale.status()).toBe(308);
    expect(stale.headers().location).toBe(canonicalPath);
    const legacy = await request.get(`/anunciante/${claimableId}`, { maxRedirects: 0 });
    expect(legacy.status()).toBe(308);
    expect(legacy.headers().location).toBe(canonicalPath);
    const sitemap = await request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain(canonicalPath);
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Sitemap: https://www.tudomacae.com.br/sitemap.xml");

    await click(pageObject(page).getByRole("link", {
      name: `${categoryFixture.category.name}: ${categoryFixture.subcategory.name}`,
      exact: true,
    }));
    await expect(page).toHaveURL(new RegExp(`/negocios\?.*subcategoria=${categoryFixture.subcategory.id}`));
    await expect(pageObject(page).getByRole("heading", { name: `Negócios de ${categoryFixture.subcategory.name}` })).toBeVisible();
    await expect(pageObject(page).locator("article")).toHaveCount(21);
    await expect(pageObject(page).getByRole("button", { name: "Carregar mais negócios" }))
      .not.toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`);
    await expect(pageObject(page).getByRole("navigation", {
      name: `Conteúdo de ${categoryFixture.category.name}`,
    })).toBeVisible();
    const subcategoryNavigation = pageObject(page).locator("details").filter({
      hasText: "Explore por subcategoria",
    });
    const categoryBusinessesHeading = pageObject(page).getByRole("heading", {
      name: `Negócios de ${categoryFixture.category.name}`,
      exact: true,
    });
    await expect(categoryBusinessesHeading).toBeInViewport();
    await click(subcategoryNavigation.getByText("Explore por subcategoria", { exact: true }));
    await expect(subcategoryNavigation.getByRole("link", {
      name: categoryFixture.subcategory.name,
      exact: true,
    })).toBeVisible();
    const categoryBusinesses = pageObject(page).locator("section").filter({
      has: categoryBusinessesHeading,
    });
    await expect(categoryBusinesses.locator("article")).toHaveCount(6);
    await expect(categoryBusinesses.getByRole("link", {
      name: `Ver todos os negócios de ${categoryFixture.category.name}`,
      exact: true,
    })).toBeVisible();
    await expect(categoryBusinesses.getByRole("link", {
      name: `${categoryFixture.category.name}: ${categoryFixture.subcategory.name}`,
      exact: true,
    })).toHaveCount(6);
    let previewBusinessFixture: typeof createdBusinesses[number] | undefined;
    for (const business of createdBusinesses) {
      const candidateLink = categoryBusinesses.getByRole("link", { name: business.title, exact: true });
      if (await candidateLink.count() === 1) {
        previewBusinessFixture = business;
        break;
      }
    }
    if (!previewBusinessFixture) throw new Error("A prévia deve mostrar um dos negócios criados pelo teste");
    const previewBusinessLink = categoryBusinesses.getByRole("link", {
      name: previewBusinessFixture.title,
      exact: true,
    });
    const canonicalPreviewPath = businessCanonicalPath(previewBusinessFixture);
    await expect(previewBusinessLink).toHaveAttribute("href", canonicalPreviewPath);
    await click(previewBusinessLink);
    await expect(page).toHaveURL(new RegExp(`${canonicalPreviewPath}$`));
    await expect(pageObject(page).getByRole("heading", {
      name: previewBusinessFixture.title,
      exact: true,
    })).toBeVisible();
    await page.goto(`/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`);
    await expect(pageObject(page).getByRole("navigation", {
      name: `Conteúdo de ${categoryFixture.subcategory.name}`,
    })).toBeVisible();
    const businessHeading = pageObject(page).getByRole("heading", { name: `Negócios da subcategoria ${categoryFixture.subcategory.name}` });
    const publishHeading = pageObject(page).getByRole("heading", { name: `Quer anunciar em ${categoryFixture.subcategory.name}?` });
    await expect(businessHeading).toBeInViewport();
    await expect(publishHeading).toBeVisible();
    const businessBox = await businessHeading.boundingBox();
    const publishBox = await publishHeading.boundingBox();
    expect(businessBox?.y).toBeLessThan(publishBox?.y ?? 0);

    const syntheticQuery = `${prefix} 00`;
    await page.goto(`/negocios?subcategoria=${categoryFixture.subcategory.id}&nome=${encodeURIComponent(syntheticQuery)}`);
    const businessLinkWithQuery = pageObject(page).getByRole("link", { name: `${prefix} 00`, exact: true });
    await expect(businessLinkWithQuery).toBeVisible();
    /* eslint-disable-next-line local/no-raw-playwright-page-selectors -- Referrer policy is a non-visible head tag. */
    await expect(page.locator("meta[name=\"referrer\"]")).toHaveAttribute("content", "origin");

    let externalReferer: string | undefined;
    await context.route(externalRoutePattern, async (route) => {
      externalReferer = route.request().headers().referer;
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Destino controlado</title>",
      });
    });
    externalRouteInstalled = true;
    const catalogOrigin = new URL(page.url()).origin;
    const externalPageOpened = context.waitForEvent("page");
    await page.evaluate((url) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.textContent = "Destino externo controlado";
      document.body.append(link);
    }, `https://referrer-target.test/${suffix}`);
    await click(pageObject(page).getByRole("link", { name: "Destino externo controlado", exact: true }));
    const externalPage = await externalPageOpened;
    await externalPage.waitForLoadState("load");
    await expect.poll(() => externalReferer).toBe(`${catalogOrigin}/`);
    await externalPage.close();

    const openedBusinessWithQuery = page.waitForRequest(request => new URL(request.url()).pathname === canonicalPath);
    await click(businessLinkWithQuery);
    expect(await (await openedBusinessWithQuery).headerValue("referer")).toBe(`${catalogOrigin}/`);
  }
  finally {
    if (externalRouteInstalled) await context.unroute(externalRoutePattern);
    await Promise.all(profileIds.map(deleteProfileFixture));
  }
});
