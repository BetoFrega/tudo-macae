import { expect, test } from "vitest";
import { AD_SITEMAP_READ_LIMIT, AD_SITEMAP_URL_LIMIT, createAdSitemap, sitemapXml, sitemapXmlWithinBytes } from "../publicAdSitemap";

const entries = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `ad-${index}`, slug: "anuncio" }));

test.each([
  [0, 0, false],
  [AD_SITEMAP_URL_LIMIT, AD_SITEMAP_URL_LIMIT, false],
  [AD_SITEMAP_READ_LIMIT, AD_SITEMAP_URL_LIMIT, true],
])("serves at most the protocol limit from %i source entries", async (count, served, truncated) => {
  const result = await createAdSitemap({ entries: async () => entries(count) }).read();
  expect(result.entries).toHaveLength(served);
  expect(result.truncated).toBe(truncated);
});

test.each([
  ["more entries than the source may return", entries(AD_SITEMAP_READ_LIMIT + 1)],
  ["an unbounded slug", [{ id: "ad", slug: "x".repeat(1025) }]],
  ["a fractional modification time", [{ id: "ad", slug: "anuncio", lastModified: 1.5 }]],
  ["provider fields", [{ id: "ad", slug: "anuncio", body: "{}" }]],
])("rejects %s", async (_case, source) => {
  await expect(createAdSitemap({ entries: async () => source }).read()).rejects.toThrow();
});

test("writes one escaped URL set with lastmod only when known", () => {
  const xml = sitemapXml([
    { loc: "https://example.test/?a=1&b=2", lastModified: Date.UTC(2026, 9, 11) },
    { loc: "https://example.test/anuncio" },
  ]);
  expect(xml).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">"
    + "<url><loc>https://example.test/?a=1&amp;b=2</loc><lastmod>2026-10-11T00:00:00.000Z</lastmod></url>"
    + "<url><loc>https://example.test/anuncio</loc></url></urlset>");
});

test("stops at the byte budget, keeping the newest URLs and counting header and footer", () => {
  const urls = [1, 2, 3].map(index => ({ loc: `https://example.test/${index}` }));
  const fits = sitemapXml(urls.slice(0, 2));
  const exact = sitemapXmlWithinBytes(urls, new TextEncoder().encode(fits).length);
  expect(exact).toEqual({ xml: fits, count: 2, truncated: true });
  expect(sitemapXmlWithinBytes(urls.slice(0, 2), new TextEncoder().encode(fits).length).truncated).toBe(false);
  expect(sitemapXmlWithinBytes(urls, 1)).toMatchObject({ count: 0, truncated: true });
});

test("measures multibyte characters in UTF-8 bytes", () => {
  const urls = [{ loc: "https://example.test/ção" }];
  const bytes = new TextEncoder().encode(sitemapXml(urls)).length;
  expect(sitemapXmlWithinBytes(urls, bytes - 1).count).toBe(0);
  expect(sitemapXmlWithinBytes(urls, bytes).count).toBe(1);
});
