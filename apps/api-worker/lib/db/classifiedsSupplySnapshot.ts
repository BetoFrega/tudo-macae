import { z } from "zod";
import type { ClassifiedsPersistence, RecordKind } from "@tudomacae/classifieds-persistence";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";
import type { SupplySnapshotAd, SupplySnapshotStore } from "@tudomacae/advertiser-identity/supplySnapshot";
import { readBusinessCatalogSnapshot } from "./classifiedsBusinessCatalog";
import { activityAreaActive, allRecords, parseStored, profileData } from "./classifiedsSupport";

// Only the fields the snapshot exports are parsed, so title, text, contacts and userId never leave the record.
// A status outside AdStatus reads as absent, which the snapshot reports as paused and not discoverable.
const adSchema = z.object({
  status: z.enum(["active", "paused", ""]).nullish().catch(undefined), publicationState: z.string().optional(), deleting: z.boolean().optional(),
  advertiserProfileId: z.string().optional(), categoryId: z.string().optional(), subcategoryId: z.string().optional(),
  createdAt: z.number(), updatedAt: z.number().optional(),
});

/** Each kind is read on its own pinned version; a write between kinds can make the snapshot straddle it. */
export function createClassifiedsSupplySnapshotStore(persistence: ClassifiedsPersistence): SupplySnapshotStore {
  const every = (kind: RecordKind) => readBusinessCatalogSnapshot(() => allRecords(persistence, { kind })).then(result => result.items);
  return {
    async read() {
      const [ads, profiles, catalogs] = await Promise.all([every("ad"), every("profile"), every("catalog")]);
      const areas = new Map<string, Promise<boolean>>();
      return {
        ads: ads.map((record): SupplySnapshotAd => {
          const { status, ...ad } = parseStored(adSchema, record.body);
          return { id: record.id, ...ad, ...(status === undefined ? {} : { status }) };
        }),
        identities: profiles.map(record => profileData(record)),
        enabledCatalogs: new Set(catalogs.filter(record => record.body.enabled === true).map(record => record.id)),
        activityAreas: { isActive: (area: ActivityArea) => {
          const key = JSON.stringify([area.categoryId, area.subcategoryId]);
          if (!areas.has(key)) areas.set(key, activityAreaActive(persistence, area));
          return areas.get(key)!;
        } },
      };
    },
  };
}
