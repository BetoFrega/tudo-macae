import { playwrightTarget } from "../../bin/playwrightTarget";
import { expect, test } from "./_helpers/fixtures";
import { readOpenGraph } from "./_helpers/readOpenGraph";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";

const ROOT_TITLE = "Tudo Macaé | Negócios e classificados em Macaé";
const ROOT_DESCRIPTION = "Catálogo de negócios locais e anúncios de empregos, imóveis, veículos, produtos e serviços no Tudo Macaé.";

test("Meta crawlers receive social cards for public share targets", async ({
  page,
  adFixture,
  adProfileFixture,
  categoryFixture,
}) => {
  const adPath = `/anuncio/${adFixture.id}/${adFixture.slug}`;
  const categoryPath = `/categoria/${categoryFixture.category.id}/${categoryFixture.category.slug}`;
  const subcategoryPath = `${categoryPath}/${categoryFixture.subcategory.id}/${categoryFixture.subcategory.slug}`;
  const sharedTargets = [
    { path: "/", title: ROOT_TITLE, description: ROOT_DESCRIPTION },
    { path: adPath, title: adFixture.title, description: adFixture.text },
    {
      path: businessCanonicalPath(adProfileFixture),
      title: adProfileFixture.title,
      description: adProfileFixture.description,
    },
    {
      path: categoryPath,
      title: `${categoryFixture.category.name} em Macaé | Tudo Macaé`,
      description: `Encontre negócios locais e anúncios de ${categoryFixture.category.name} em Macaé. Consulte perfis, publicações e contatos no Tudo Macaé.`,
    },
    {
      path: subcategoryPath,
      title: `${categoryFixture.subcategory.name} em Macaé | ${categoryFixture.category.name} | Tudo Macaé`,
      description: `Encontre negócios locais e anúncios de ${categoryFixture.subcategory.name} em Macaé, na categoria ${categoryFixture.category.name}. Veja perfis, publicações e contatos.`,
    },
  ];

  for (const target of sharedTargets) {
    const browserResponse = await page.request.get(target.path, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    expect(browserResponse.ok()).toBe(true);

    const previewResponse = await page.request.get(target.path, {
      headers: { "user-agent": "WhatsApp/2.23.20.0 A" },
    });
    expect(previewResponse.ok()).toBe(true);
    const metadata = readOpenGraph(await previewResponse.text());
    expect(metadata).toMatchObject({
      "og:title": target.title,
      "og:description": target.description,
      "og:url": target.path === "/"
        ? playwrightTarget().canonicalOrigin
        : new URL(target.path, playwrightTarget().canonicalOrigin).href,
    });
    expect(new URL(metadata["og:image"]!).pathname).toBe("/social-preview.png");

    const parsedImageUrl = new URL(metadata["og:image"]!);
    const imageRequestUrl = parsedImageUrl.origin === playwrightTarget().canonicalOrigin
      ? `${parsedImageUrl.pathname}${parsedImageUrl.search}`
      : parsedImageUrl.href;
    const imageResponse = await page.request.get(imageRequestUrl);
    expect(imageResponse.ok()).toBe(true);
    expect(imageResponse.headers()["content-type"]).toMatch(/^image\//);
  }

  for (const userAgent of [
    "facebookexternalhit/1.1",
    "facebookcatalog/1.0",
  ]) {
    const previewResponse = await page.request.get(adPath, {
      headers: { "user-agent": userAgent },
    });
    expect(previewResponse.ok()).toBe(true);
    expect(readOpenGraph(await previewResponse.text())).toMatchObject({
      "og:title": adFixture.title,
      "og:url": new URL(adPath, playwrightTarget().canonicalOrigin).href,
    });
  }
});
