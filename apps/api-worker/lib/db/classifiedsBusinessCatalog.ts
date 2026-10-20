import type { BusinessCatalogCandidatePage, BusinessCatalogPosition } from "@tudomacae/advertiser-identity/business";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";
import { PersistenceConflict, type ClassifiedsPersistence, type StoredRecord } from "@tudomacae/classifieds-persistence";
import { persistenceLimits } from "@tudomacae/classifieds-persistence/records";
import { normalizeBusinessName } from "@tudomacae/advertiser-identity/business";
import { activityAreaActive, profileData } from "./classifiedsSupport";

const position = (record: StoredRecord): BusinessCatalogPosition => ({ normalizedTitle: normalizeBusinessName(String(record.body.title ?? "")), id: record.id });

/** Business catalog candidates in normalized-title order, the order the domain cursor encodes. Every page one
 * store reads is pinned to its first page's version, so one catalog operation scans a single snapshot. */
export function createClassifiedsBusinessCatalogStore(persistence: ClassifiedsPersistence, photoUrl?: (path: string) => string) {
  let version: number | undefined;
  return {
    store: {
      async getById(id: string) {
        const record = await persistence.read("profile", id);
        return record ? profileData(record, photoUrl) : null;
      },
      async listCandidates(input: { normalizedNamePrefix?: string; activityArea?: ActivityArea; after?: BusinessCatalogPosition; limit: number }): Promise<BusinessCatalogCandidatePage> {
        const query = (after: BusinessCatalogPosition | undefined, limit: number) => persistence.page({
          kind: "profile", order: "title", limit,
          ...(input.normalizedNamePrefix ? { normalizedTitlePrefix: input.normalizedNamePrefix } : {}),
          ...(input.activityArea ? { activityArea: { categoryId: input.activityArea.categoryId, subcategoryId: input.activityArea.subcategoryId } } : {}),
          ...(after ? { after: JSON.stringify([after.normalizedTitle, "", after.id]) } : {}),
        }, version).then((page) => {
          version ??= page.version;
          return page;
        });
        // One extra record proves another page exists. A short page is either the end or a cut by the byte
        // window (legacy bodies can approach recordBytes), so a one-record probe tells them apart.
        const size = Math.min(input.limit, persistenceLimits.pageItems - 1);
        const page = await query(input.after, size + 1);
        const records = page.items.slice(0, size);
        const last = records.at(-1);
        const more = page.items.length > size || (last !== undefined && (await query(position(last), 1)).items.length > 0);
        return {
          items: records.map(record => ({ profile: profileData(record, photoUrl), position: position(record) })),
          ...(more && last ? { next: position(last) } : {}),
        };
      },
    },
    activityAreas: { isActive: (area: ActivityArea) => activityAreaActive(persistence, area) },
  };
}

/** Repeats a catalog operation on a fresh snapshot when a write lands between its pages. */
export async function readBusinessCatalogSnapshot<T>(read: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    }
    catch (error) {
      if (!(error instanceof PersistenceConflict) || attempt >= 3) throw error;
    }
  }
}
