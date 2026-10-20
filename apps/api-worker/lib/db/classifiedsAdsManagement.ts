import type { AdManagementStore } from "@tudomacae/ads/management";
import { hasCompletedPublication, visibleAdImages } from "@tudomacae/ads/visibility";
import { PersistenceConflict } from "@tudomacae/classifieds-persistence";
import { jsonValue } from "./classifiedsSupport";
import { body, data, forbidden, publicAd } from "./classifiedsAdsRecords";
import type { ClassifiedsAdContext } from "./classifiedsAdsContext";

export function createManagementStore(context: ClassifiedsAdContext): AdManagementStore {
  const { persistence, actorId, now, authority, authorize, readAll, ownedAds, cleanup, urls, readAd, profileReader, listAds } = context;
  return {
    async create(record) {
      const id = context.newId();
      const committed = await persistence.transact({ actorId, key: id, operation: "ads.create", input: jsonValue(record) }, async (tx) => {
        if (await tx.read("ad", id) || await tx.read("retirement", id, "ad_deletions")) throw new PersistenceConflict();
        const profile = await tx.read("profile", record.advertiserProfileId);
        authority.create(profile?.body ?? null);
        tx.put({ kind: "ad", id, body: body({ ...record, userId: actorId, createdAt: now(), revision: 1 }) });
        return null;
      });
      if (committed.replayed) {
        const current = await persistence.read("ad", id);
        if (!current) forbidden();
        await authorize(current, persistence, false);
      }
      return id;
    },
    getById: readAd,
    getAll: () => {
      authority.administrator();
      return listAds({ kind: "ad", order: "createdDesc" });
    },
    getByUserId: (userId) => {
      authority.owner(userId);
      return ownedAds(userId).then(async (records) => {
        const reader = profileReader();
        const values = [];
        for (const record of records) if (hasCompletedPublication(data(record))) {
          const value = await authorize(record, reader);
          values.push({ ...value, advertiserProfileId: value.advertiserProfileId ?? "", images: await urls(record.id, visibleAdImages(value.images)) });
        }
        return values;
      });
    },
    async getActiveByProfileId(profileId) {
      const profile = await persistence.read("profile", profileId);
      if (!authority.canListForProfile(profile?.body ?? null)) return [];
      const ads = (await readAll({ kind: "ad", profileId, order: "createdDesc" })).items.map(data)
        .filter(ad => hasCompletedPublication(ad) && ad.status === "active" && !ad.deleting)
        .map(ad => publicAd(ad, visibleAdImages(ad.images)));
      return Promise.all(ads.map(async ad => ({ ...ad, images: await urls(ad.id, ad.images) })));
    },
    async getPendingImageCleanupPaths(id) {
      const record = await persistence.read("ad", id);
      return record ? (await authorize(record, persistence)).pendingImageCleanupPaths ?? [] : [];
    },
    async delete(id) {
      await persistence.transact(null, async (tx) => {
        const record = await tx.read("ad", id);
        if (record) {
          const value = await authorize(record, tx);
          authority.completed(value);
          await cleanup(tx, id, [...value.images.map(image => image.path), ...value.pendingImageCleanupPaths ?? [], ...value.pendingImageCleanupClaims ?? [], ...(value.pendingImageUploadReservations ?? []).map(item => item.path)]);
          await tx.read("retirement", id, "ad_deletions");
          tx.put({ kind: "retirement", id, namespace: "ad_deletions", body: { userId: actorId, deletedAt: now() } });
          tx.remove("ad", id);
        }
        return null;
      });
    },
  };
}
