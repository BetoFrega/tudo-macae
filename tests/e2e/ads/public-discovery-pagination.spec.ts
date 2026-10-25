import { createProfileFixture } from "../_helpers/advertiser-profile/profileFixtures";
import { createAdRecordFixture, publishPublicationFixture, savePublicationFixture, savePublicationProfileFixture } from "../_helpers/ads/publicationFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { mkdir } from "node:fs/promises";
import { expect, test } from "../_helpers/fixtures";
import { pageObject } from "../_helpers/fixtures/POMs/pageObject";
import { AdDiscoveryPage } from "../_helpers/ads/POMs/AdDiscoveryPage";
import { deleteAdFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
import { slugify } from "@tudomacae/text-normalization/slugify";

test("public category, subcategory and profile links reach ads beyond the first page and robots discovers their sitemap", async ({
  page, request, authentication, userCredentials, adProfileFixture, categoryFixture, adFixture, createAdPage,
}) => {
  test.setTimeout(300000);
  const created: string[] = [];
  await authentication.login(userCredentials);
  try {
    for (let index = 0; index < 30; index++) {
      await page.goto("/publicar");
      await createAdPage.createAd({
        category: categoryFixture.category.name,
        subcategory: categoryFixture.subcategory.name,
        advertiserProfile: adProfileFixture.title,
        title: `Paginação ${index} ${adFixture.id}`,
        text: "Anúncio criado pela jornada pública para verificar a continuação da lista.",
      });
      await expect(page).toHaveURL(/\/anuncio\/[^/]+\/[^/]+$/);
      created.push(new URL(page.url()).pathname.split("/")[2]);
      if (index === 28) {
        const { category, subcategory } = categoryFixture;
        for (const path of [
          `/categoria/${category.id}/${category.slug}`,
          `/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`,
          `/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}`,
        ]) {
          await page.goto(path);
          await expect(pageObject(page).getByRole("heading", { name: adFixture.title, exact: true }).filter({ visible: true })).toBeVisible();
          await expect(pageObject(page).getByRole("link", { name: "Mais anúncios", exact: true }).filter({ visible: true })).toHaveCount(0);
        }
      }
    }
    const { category, subcategory } = categoryFixture;
    for (const path of [
      `/categoria/${category.id}/${category.slug}`,
      `/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`,
      `/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}`,
    ]) {
      await page.goto(path);
      const navigation = pageObject(page).getByRole("navigation", { name: "Páginas de anúncios", exact: true }).filter({ visible: true });
      await expect(navigation.getByRole("link", { name: "Mais anúncios", exact: true })).toBeVisible();
      const more = navigation.getByRole("link", { name: "Mais anúncios", exact: true });
      await more.focus();
      await more.press("Enter");
      await expect(page).toHaveURL(/adCursor=/);
      const adsSection = new AdDiscoveryPage(page).adsSection;
      await expect(adsSection.getByRole("heading", { level: 2 })).toBeFocused();
      await page.keyboard.press("Tab");
      // The first link is the first ad card: keyboard reading resumes in the requested content.
      await expect(new AdDiscoveryPage(page).firstAdLink).toBeFocused();
      const continuation = new URL(page.url());
      const expected = continuation.href;
      continuation.pathname = continuation.pathname.replace(/\/[^/]+$/, "/titulo-anterior");
      await page.goto(continuation.href);
      await expect(page).toHaveURL(expected);
      if (path.startsWith("/negocio/")) {
        continuation.pathname = "/anunciante/" + adProfileFixture.id;
        await page.goto(continuation.href);
        await expect(page).toHaveURL(expected);
      }
      await expect(pageObject(page).getByRole("heading", { name: adFixture.title, exact: true }).filter({ visible: true })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Primeira página de anúncios", exact: true })).toBeVisible();
    }
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Sitemap: https://www.tudomacae.com.br/sitemaps/anuncios.xml");
    // The origin reuses a read for about a minute; polling outlasts one stale render.
    await expect.poll(async () => {
      const sitemap = await request.get("/sitemaps/anuncios.xml");
      expect(sitemap.status()).toBe(200);
      return sitemap.text();
    }, { timeout: 90_000, intervals: [1000, 2000, 5000] }).toContain(`/anuncio/${adFixture.id}/${adFixture.slug}</loc>`);
  }
  finally {
    await Promise.all(created.map(deleteAdFixture));
  }
});

test("invalid continuation links recover to the first page in all four public listings", async ({
  page, adProfileFixture, categoryFixture, adFixture, userCredentials,
}) => {
  const { category, subcategory } = categoryFixture;
  const crossQueryCursor = Buffer.from(JSON.stringify({
    key: JSON.stringify([{ kind: "all" }, 30]), after: { createdAt: 1, id: "invented" },
  })).toString("base64url");
  const longLegacyTitle = "P".repeat(32);
  const legacyId = await createProfileFixture(userCredentials, { title: longLegacyTitle, description: "Perfil legado para verificar a paginação.", contacts: [{ number: "22999999999", isWhatsapp: true }] });
  const legacyAd = await createAdRecordFixture(userCredentials, { advertiserProfileId: legacyId, categoryId: category.id, subcategoryId: subcategory.id, title: `Anúncio legado ${adFixture.id}`, text: "Anúncio criado para verificar a recuperação da paginação." });
  try {
    for (const [path, title] of [
      [`/categoria/${category.id}/${category.slug}`, adFixture.title],
      [`/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`, adFixture.title],
      [`/negocio/${adProfileFixture.id}/${slugify(adProfileFixture.title)}`, adFixture.title],
      [`/anunciante/${legacyId}`, `Anúncio legado ${adFixture.id}`],
    ]) {
      for (const query of ["adCursor=broken", "adCursor=", "adCursor=one&adCursor=two", `adCursor=${crossQueryCursor}`]) {
        await page.goto(`${path}?${query}`);
        const recovery = pageObject(page).getByRole("status").filter({ hasText: "Esta página de anúncios é inválida." });
        await expect(recovery).toBeVisible();
        const recover = recovery.getByRole("link", { name: "Primeira página de anúncios", exact: true });
        await recover.focus();
        await recover.press("Enter");
        await expect(page).toHaveURL(`${path}#anuncios`);
        const adsSection = new AdDiscoveryPage(page).adsSection;
        const adsHeading = adsSection.getByRole("heading", { level: 2 });
        await expect(adsHeading).toBeFocused();
        await new AdDiscoveryPage(page).expectHeadingBelowNavigation();
        if (query === "adCursor=broken") {
          const state = path.startsWith("/negocio/") ? "business" : path.startsWith("/anunciante/") ? "advertiser" : path.split("/").length > 4 ? "subcategory" : "category";
          await mkdir("test-results/pr1542-focus", { recursive: true });
          for (const [width, height] of [[1280, 900], [390, 844]]) {
            await page.setViewportSize({ width, height });
            await expect(adsHeading).toBeFocused();
            if (state === "advertiser" && width === 390) {
              await page.evaluate(() => {
                document.documentElement.style.fontSize = "200%";
              });
              const profileTitle = pageObject(page).getByRole("heading", {
                name: longLegacyTitle,
                exact: true,
              });
              const profileDescription = pageObject(page).getByText("Perfil legado para verificar a paginação.", { exact: true });
              const profileContact = pageObject(page).getByRole("link", { name: "WhatsApp (22) 99999-9999", exact: true });
              await expect(profileTitle).toBeVisible();
              await expect(profileDescription).toBeVisible();
              await expect(profileContact).toBeVisible();
              const contentBounds = await Promise.all([profileTitle, profileDescription, profileContact].map(locator => locator.evaluate((element) => {
                const bounds = element.getBoundingClientRect();
                return {
                  left: bounds.left,
                  right: bounds.right,
                  width: bounds.width,
                  clientWidth: element.clientWidth,
                  scrollWidth: element.scrollWidth,
                };
              })));
              const browserLayout = await profileTitle.evaluate((title) => {
                const card = title.closest<HTMLElement>("[data-slot='card']")!;
                const titleBounds = title.getBoundingClientRect();
                const cardBounds = card.getBoundingClientRect();
                const collectOverflowCandidates = (elements: Iterable<HTMLElement>) => Array.from(elements)
                  .map((element) => {
                    const bounds = element.getBoundingClientRect();
                    const overflow = Math.max(-bounds.left, bounds.right - window.innerWidth, element.scrollWidth - element.clientWidth);
                    if (overflow <= 1) return null;
                    const style = window.getComputedStyle(element);
                    return {
                      tag: element.tagName.toLowerCase(),
                      testId: element.dataset.testid ?? null,
                      className: (element.getAttribute("class") ?? "").slice(0, 160),
                      bounds: [bounds.left, bounds.right, bounds.width],
                      clientWidth: element.clientWidth,
                      scrollWidth: element.scrollWidth,
                      overflow,
                      style: [style.display, style.position, style.minWidth, style.maxWidth, style.flexShrink, style.whiteSpace, style.overflowX],
                      parents: [element.parentElement, element.parentElement?.parentElement].filter(Boolean).map(parent => `${parent!.tagName.toLowerCase()}#${parent!.dataset.testid ?? ""}.${(parent!.getAttribute("class") ?? "").slice(0, 80)}`),
                    };
                  })
                  .filter(candidate => candidate !== null)
                  .sort((left, right) => right.overflow - left.overflow)
                  .slice(0, 12);
                const header = document.querySelector<HTMLElement>("body > header");
                const overflowCandidates = collectOverflowCandidates(document.body.querySelectorAll<HTMLElement>("*"));
                const headerOverflowCandidates = header
                  ? collectOverflowCandidates([header, ...header.querySelectorAll<HTMLElement>("*")])
                  : [];
                return {
                  viewportWidth: window.innerWidth,
                  rootFontSize: getComputedStyle(document.documentElement).fontSize,
                  documentWidth: document.documentElement.scrollWidth,
                  titleLeft: titleBounds.left,
                  titleRight: titleBounds.right,
                  titleClientWidth: title.clientWidth,
                  titleScrollWidth: title.scrollWidth,
                  cardLeft: cardBounds.left,
                  cardRight: cardBounds.right,
                  cardClientWidth: card.clientWidth,
                  cardScrollWidth: card.scrollWidth,
                  overflowCandidates,
                  headerOverflowCandidates,
                };
              });
              const legacyAdCard = pageObject(page).getByRole("heading", { name: `Anúncio legado ${adFixture.id}`, exact: true, level: 3 });
              await expect(legacyAdCard).toBeVisible();
              const adCardClippedContent = await legacyAdCard.evaluate((title) => {
                const card = title.closest<HTMLElement>("[data-slot='card']")!;
                const cardBounds = card.getBoundingClientRect();
                return Array.from(card.querySelectorAll<HTMLElement>("*"))
                  .filter((element) => {
                    const bounds = element.getBoundingClientRect();
                    if (bounds.width <= 0 || bounds.height <= 0) return false;
                    return bounds.left < cardBounds.left - 1 || bounds.right > cardBounds.right + 1
                      || element.scrollWidth > element.clientWidth + 1;
                  })
                  .map((element) => {
                    const bounds = element.getBoundingClientRect();
                    return {
                      tag: element.tagName.toLowerCase(),
                      className: (element.getAttribute("class") ?? "").slice(0, 160),
                      bounds: [bounds.left, bounds.right, bounds.width],
                      cardBounds: [cardBounds.left, cardBounds.right],
                      clientWidth: element.clientWidth,
                      scrollWidth: element.scrollWidth,
                    };
                  });
              });
              const profileTextWidth = await profileTitle.evaluate((title) => {
                const card = title.closest<HTMLElement>("[data-slot='card']")!;
                return { title: title.getBoundingClientRect().width, card: card.clientWidth };
              });
              const layout = { contentBounds, adCardClippedContent, profileTextWidth, ...browserLayout };
              const diagnostic = `Profile reflow geometry: ${JSON.stringify(layout)}`;
              expect(layout.viewportWidth, diagnostic).toBe(390);
              expect(layout.contentBounds[0].left, diagnostic).toBeGreaterThanOrEqual(-1);
              expect(layout.contentBounds[0].right, diagnostic).toBeLessThanOrEqual(layout.viewportWidth + 1);
              expect(layout.contentBounds[1].left, diagnostic).toBeGreaterThanOrEqual(-1);
              expect(layout.contentBounds[1].right, diagnostic).toBeLessThanOrEqual(layout.viewportWidth + 1);
              expect(layout.contentBounds[2].left, diagnostic).toBeGreaterThanOrEqual(-1);
              expect(layout.contentBounds[2].right, diagnostic).toBeLessThanOrEqual(layout.viewportWidth + 1);
              expect(layout.titleLeft, diagnostic).toBeGreaterThanOrEqual(layout.cardLeft - 1);
              expect(layout.titleRight, diagnostic).toBeLessThanOrEqual(layout.cardRight + 1);
              expect(layout.cardLeft, diagnostic).toBeGreaterThanOrEqual(-1);
              expect(layout.cardRight, diagnostic).toBeLessThanOrEqual(layout.viewportWidth + 1);
              expect(layout.titleScrollWidth, diagnostic).toBeLessThanOrEqual(layout.titleClientWidth + 1);
              expect(layout.cardScrollWidth, diagnostic).toBeLessThanOrEqual(layout.cardClientWidth + 1);
              expect(layout.documentWidth, diagnostic).toBeLessThanOrEqual(layout.viewportWidth);
              // An avatar kept beside the text leaves the profile text a sliver of the card.
              expect(layout.profileTextWidth.title, diagnostic).toBeGreaterThanOrEqual(layout.profileTextWidth.card / 2);
              expect(layout.adCardClippedContent, diagnostic).toEqual([]);
              await page.evaluate(() => window.scrollTo(0, 0));
              await page.screenshot({ path: "test-results/pr1542-focus/advertiser-390-text-200-percent.png", fullPage: true });
              await page.evaluate(() => {
                document.documentElement.style.removeProperty("font-size");
              });
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `test-results/pr1542-focus/${state}-${width}.png`, fullPage: true });
          }
          await page.setViewportSize({ width: 1280, height: 900 });
        }
        await page.keyboard.press("Tab");
        // The first interactive ad card follows the section heading in the keyboard order.
        await expect(new AdDiscoveryPage(page).firstAdLink).toBeFocused();
        await expect(pageObject(page).getByRole("heading", { name: title, exact: true }).filter({ visible: true })).toBeVisible();
      }
    }
  }
  finally {
    await deleteAdFixture(legacyAd.id);
    await deleteProfileFixture(legacyId);
  }
});

test("generated long profiles remain discoverable", async ({ page, verifiedUserCredentials, categoryFixture }) => {
  const publicationId = crypto.randomUUID().padEnd(200, "p");
  const title = `Anúncio de perfil longo ${crypto.randomUUID()}`;
  let profileId: string | undefined;
  try {
    await savePublicationFixture(verifiedUserCredentials, { id: publicationId, title,
      text: "Anúncio de teste para verificar a descoberta de um perfil gerado longo.",
      categoryId: categoryFixture.category.id, subcategoryId: categoryFixture.subcategory.id });
    profileId = await savePublicationProfileFixture(verifiedUserCredentials, { publicationId,
      title: "Perfil gerado longo", contacts: [{ number: "22999999999", isWhatsapp: true }] });
    expect(profileId).toHaveLength(212);
    await publishPublicationFixture(verifiedUserCredentials, publicationId);
    await page.goto(`/anunciante/${profileId}`);
    await expect(pageObject(page).getByRole("heading", { name: title, exact: true }).filter({ visible: true })).toBeVisible();
  }
  finally {
    await deleteAdFixture(publicationId);
    if (profileId) await deleteProfileFixture(profileId);
  }
});
