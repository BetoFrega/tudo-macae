import type { PublicAdStore } from "@tudomacae/ads/publicDiscovery";
import { AD_SITEMAP_READ_LIMIT, toAdSitemapEntry, type AdSitemapEntry } from "@tudomacae/ads/publicAdSitemap";
import { canDiscoverAd, hasCompletedPublication, visibleAdImages } from "@tudomacae/ads/visibility";
import type { StoredRecord } from "@tudomacae/classifieds-persistence";
import { PersistenceConflict } from "@tudomacae/classifieds-persistence";
import { data, publicAd } from "./classifiedsAdsRecords";
import type { ClassifiedsAdContext } from "./classifiedsAdsContext";

type PublicPageInput = Parameters<PublicAdStore["read"]>[0];
function publicPageScope(scope: PublicPageInput["scope"]) {
  return {
    ...(scope.kind === "category" || scope.kind === "subcategory" ? { categoryId: scope.categoryId } : {}),
    ...(scope.kind === "subcategory" ? { subcategoryId: scope.subcategoryId } : {}),
    ...(scope.kind === "profile" ? { profileId: scope.profileId } : {}),
  };
}

/** Anonymous reads: the ad sitemap, single public ads and discovery pages. */
export function createPublicAdReads(context: ClassifiedsAdContext) {
  const { persistence, urls } = context;
  /** Reads one record beyond `limit` from a single snapshot version to detect more pages. */
  async function scanPublicPage({ scope, limit, after: start }: PublicPageInput) {
    const query = { kind: "ad" as const, order: "createdDesc" as const, status: "active", completedPublication: true, ...publicPageScope(scope) };
    const records: StoredRecord[] = [];
    let after = start ? JSON.stringify([start.createdAt, "", start.id]) : undefined;
    let version: number | undefined;
    do {
      const page = await persistence.page({ ...query, limit: Math.min(25, limit + 1 - records.length), ...(after ? { after } : {}) }, version);
      version ??= page.version;
      records.push(...page.items);
      after = page.next;
    } while (after && records.length <= limit);
    return records;
  }
  async function scanPublicPageWithRetries(input: PublicPageInput) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await scanPublicPage(input);
      }
      catch (error) {
        if (!(error instanceof PersistenceConflict) || attempt >= 3) throw error;
      }
    }
  }
  return {
    /** One entry beyond the URL limit lets the reader detect overflow. */
    async sitemap(): Promise<AdSitemapEntry[]> {
      return (await persistence.adSitemap(AD_SITEMAP_READ_LIMIT)).map(toAdSitemapEntry);
    },
    async publicRead(id: string) {
      const record = await persistence.read("ad", id);
      if (!record) return null;
      const value = data(record);
      if (!hasCompletedPublication(value) || value.deleting) return null;
      return publicAd(value, await urls(id, visibleAdImages(value.images)));
    },
    async publicPage(input: PublicPageInput) {
      const { limit } = input;
      const records = await scanPublicPageWithRetries(input);
      const candidates = records.slice(0, limit);
      const selected = candidates.filter(record => canDiscoverAd(data(record)));
      const last = candidates.at(-1);
      return { scanned: records.length, hasMore: records.length > limit,
        ...(last ? { lastScanned: { id: last.id, createdAt: Number(last.body.createdAt) } } : {}),
        items: await Promise.all(selected.map(async (record) => {
          const value = data(record);
          return publicAd(value, await urls(record.id, visibleAdImages(value.images).slice(0, 1)));
        })),
      };
    },
  };
}
