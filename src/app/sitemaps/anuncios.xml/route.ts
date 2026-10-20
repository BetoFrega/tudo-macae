import { connection } from "next/server";
import { adSitemapUnavailable, logAdSitemapRender } from "@/features/ads/sitemapHttp";
import { CANONICAL_APP_ORIGIN } from "../../../../bin/appOrigin";
import { sitemapXmlWithinBytes } from "@tudomacae/ads/publicAdSitemap";
import { AD_SITEMAP_CACHE_SECONDS, getAdSitemap } from "@/integrations/ads/adSitemapProduction";

export async function GET(request: Request) {
  // Reading at build time would publish a deploy-time snapshot.
  await connection();
  try {
    const { entries, truncated } = await getAdSitemap();
    const urls = entries.map(entry => ({
      loc: new URL(`/anuncio/${encodeURIComponent(entry.id)}/${entry.slug}`, CANONICAL_APP_ORIGIN).href,
      ...(entry.lastModified === undefined ? {} : { lastModified: entry.lastModified }),
    }));
    const sitemap = sitemapXmlWithinBytes(urls);
    logAdSitemapRender(sitemap.count, truncated || sitemap.truncated, request);
    if (sitemap.count === 0) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(sitemap.xml, {
      headers: { "Content-Type": "application/xml", "Cache-Control": `public, max-age=${AD_SITEMAP_CACHE_SECONDS}` },
    });
  }
  catch (error) {
    return adSitemapUnavailable(error, request);
  }
}
