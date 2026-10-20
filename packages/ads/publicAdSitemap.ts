import { z } from "zod";
import { publicationIdentifier } from "./validation";

/** The sitemap protocol's per-file URL limit; `/sitemaps/anuncios.xml` is one file. */
export const AD_SITEMAP_URL_LIMIT = 50_000;
/** The sitemap protocol's uncompressed per-file size limit (50 MiB); long ids and slugs can reach it before the URL limit. */
export const AD_SITEMAP_BYTE_LIMIT = 52_428_800;
/** Sources return one entry beyond the limit so the reader can detect overflow. */
export const AD_SITEMAP_READ_LIMIT = AD_SITEMAP_URL_LIMIT + 1;

const entry = z.object({
  id: publicationIdentifier,
  slug: z.string().max(1024),
  /** Epoch milliseconds of the last public change, when known. */
  lastModified: z.number().int().nonnegative().optional(),
}).strict();
export const adSitemapEntries = z.array(entry).max(AD_SITEMAP_READ_LIMIT);
export type AdSitemapEntry = z.infer<typeof entry>;

/** Normalizes a raw source row: a missing slug becomes empty and an invalid timestamp drops `<lastmod>`. */
export function toAdSitemapEntry(row: { id: string; slug: unknown; lastModified: unknown }): AdSitemapEntry {
  const { id, slug, lastModified } = row;
  return {
    id, slug: typeof slug === "string" ? slug : "",
    ...(typeof lastModified === "number" && Number.isSafeInteger(lastModified) && lastModified >= 0 ? { lastModified } : {}),
  };
}

/** Reads the newest active published Anúncios, at most one beyond the URL limit. */
export function createAdSitemap(dependencies: { entries(): Promise<unknown> }) {
  return {
    async read() {
      const entries = adSitemapEntries.parse(await dependencies.entries());
      return {
        entries: entries.slice(0, AD_SITEMAP_URL_LIMIT),
        truncated: entries.length > AD_SITEMAP_URL_LIMIT,
      };
    },
  };
}

const sitemapHeader = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">";
const sitemapFooter = "</urlset>";
type SitemapUrl = { loc: string; lastModified?: number };

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, character => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;",
  })[character]!);
}

function urlXml({ loc, lastModified }: SitemapUrl) {
  return `<url><loc>${escapeXml(loc)}</loc>${lastModified === undefined ? "" : `<lastmod>${new Date(lastModified).toISOString()}</lastmod>`}</url>`;
}

export function sitemapXml(urls: readonly SitemapUrl[]) {
  return sitemapHeader + urls.map(urlXml).join("") + sitemapFooter;
}

/** Keeps the leading URLs (newest first) whose UTF-8 document, header and footer included, fits `maxBytes`. */
export function sitemapXmlWithinBytes(urls: readonly SitemapUrl[], maxBytes = AD_SITEMAP_BYTE_LIMIT) {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(sitemapHeader + sitemapFooter).length;
  const parts: string[] = [];
  for (const url of urls) {
    const part = urlXml(url);
    bytes += encoder.encode(part).length;
    if (bytes > maxBytes) break;
    parts.push(part);
  }
  return { xml: sitemapHeader + parts.join("") + sitemapFooter, count: parts.length, truncated: parts.length < urls.length };
}
