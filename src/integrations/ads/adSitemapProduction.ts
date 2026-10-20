import { cacheLife } from "next/cache";
import { createAdSitemap } from "@tudomacae/ads/publicAdSitemap";
import { AdSitemapReadError, classifyAdSitemapError } from "@tudomacae/ads/adSitemapFailure";
import { route } from "@/packages/classifieds-api/route";

/** Shared caches may reuse the rendered URL set for this long. */
export const AD_SITEMAP_CACHE_SECONDS = 3600;
/** Newest discoverable Anúncios, one beyond the URL limit. */
export const readAdSitemapEntries = route<() => Promise<unknown>>("ads.sitemap", () => ({}));
const sitemap = createAdSitemap({ entries: readAdSitemapEntries });

async function cachedAdSitemap() {
  "use cache";
  try {
    const result = await sitemap.read();
    // Bounds origin reads per instance even when no shared cache stores the response.
    cacheLife("minutes");
    return { outcome: "completed" as const, ...result };
  }
  catch (error) {
    // Transport only a bounded cause across React's cache serialization boundary.
    cacheLife({ stale: 0, revalidate: 0, expire: 1 });
    return { outcome: "failed" as const, errorClass: classifyAdSitemapError(error) };
  }
}

export async function getAdSitemap() {
  const result = await cachedAdSitemap();
  if (result.outcome === "failed") throw new AdSitemapReadError(result.errorClass);
  return { entries: result.entries, truncated: result.truncated };
}
