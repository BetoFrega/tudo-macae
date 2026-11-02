import { publishPublicationFixture, savePublicationFixture, savePublicationProfileFixture } from "../_helpers/ads/publicationFixtures";
import { deleteProfileFixture } from "../../_helpers/auth/db/deleteFixtureDocuments";
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
      await new AdDiscoveryPage(page).expectHeadingBelowNavigation();
      await page.keyboard.press("Tab");
      // The first link is the first ad card: keyboard reading resumes in the requested content.
      await expect(new AdDiscoveryPage(page).firstAdLink).toBeFocused();
      await expect(pageObject(page).getByRole("heading", { name: adFixture.title, exact: true }).filter({ visible: true })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Primeira página de anúncios", exact: true })).toBeVisible();
    }
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Sitemap: https://www.tudomacae.com.br/sitemaps/anuncios.xml");
    // The origin may serve a read up to a minute old, so this proves the route reaches public ads, not that a new ad is listed;
    // which ads are listed is covered by classifiedsRuntimeSitemapTests.ts and the route's rendering by its route.test.ts.
    const sitemap = await request.get("/sitemaps/anuncios.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<url><loc>https://www.tudomacae.com.br/anuncio/");
  }
  finally {
    await Promise.all(created.map(deleteAdFixture));
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
