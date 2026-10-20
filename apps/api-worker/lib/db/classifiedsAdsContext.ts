import type { AdImage } from "@tudomacae/ads/types";
import { createHash } from "node:crypto";
import { createAdAuthority } from "@tudomacae/ads/authority";
import { createPhotoPathPolicy } from "@tudomacae/classifieds-photos/paths";
import { hasCompletedPublication, visibleAdImages } from "@tudomacae/ads/visibility";
import type { ClassifiedsPersistence, StoredRecord, Transaction } from "@tudomacae/classifieds-persistence";
import { PersistenceConflict } from "@tudomacae/classifieds-persistence";
import { allRecords, StoredClassifiedsDataError } from "./classifiedsSupport";
import { data } from "./classifiedsAdsRecords";
import { scheduleAdPhotoCleanup } from "./classifiedsAdCleanupJobs";

export type ClassifiedsAdDependencies = {
  persistence: ClassifiedsPersistence; actorId: string; admin: boolean; emailVerified: boolean; now(): number; newId(): string;
};
export type ClassifiedsAdContext = ReturnType<typeof createClassifiedsAdContext>;

/** Actor-scoped authorization, reads and cleanup intents shared by every ad store. */
export function createClassifiedsAdContext(dependencies: ClassifiedsAdDependencies) {
  const { persistence, actorId, admin, now } = dependencies;
  const authority = createAdAuthority({ id: actorId, admin, emailVerified: dependencies.emailVerified });
  const paths = createPhotoPathPolicy(async bytes => createHash("sha256").update(bytes).digest("hex"));
  async function authorize(record: StoredRecord, tx: Pick<Transaction, "read">, allowAdmin = true) {
    const ad = data(record);
    const profile = ad.advertiserProfileId ? await tx.read("profile", ad.advertiserProfileId) : null;
    authority.authorize(ad, profile?.body ?? null, allowAdmin);
    return ad;
  }
  async function readAll(query: Parameters<typeof persistence.page>[0]) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await allRecords(persistence, query);
      }
      catch (error) {
        if (!(error instanceof PersistenceConflict) || attempt >= 3) throw error;
      }
    }
  }
  async function ownedAds(userId: string) {
    return (await readAll({ kind: "ad", advertiserOwnerId: userId, order: "createdDesc" })).items;
  }
  async function handoffCleanup(tx: Transaction, id: string, candidates: string[]) {
    const key = `handoff-${createHash("sha256").update(JSON.stringify([id, candidates.toSorted()])).digest("hex")}`;
    const job = await tx.read("adCleanup", key);
    if (job && (job.body.adId !== id || job.body.stage !== "handoff")) throw new StoredClassifiedsDataError(new TypeError("Intenção de limpeza incoerente."));
    if (!job) tx.put({ kind: "adCleanup", id: key, body: { adId: id, stage: "handoff", paths: candidates, status: "pending", dueAt: now(), writerCompleted: true } });
  }
  async function cleanup(tx: Transaction, id: string, paths: string[]) {
    const candidates = [...new Set(paths)];
    if (candidates.length > 10) return handoffCleanup(tx, id, candidates);
    for (const path of candidates) await scheduleAdPhotoCleanup(tx, id, path, now);
  }
  async function urls(id: string, images: AdImage[]) {
    return Promise.all(images.map(async (image) => {
      if (await paths.owns({ ownerKind: "ad", ownerId: id, path: image.path })) return { ...image, url: `/api/anuncios/${encodeURIComponent(id)}/fotos/${encodeURIComponent(image.id)}` };
      return image;
    }));
  }
  async function uploadRevisions(id: string, images: AdImage[]) {
    return Promise.all(images.map(async (image) => {
      const photo = await persistence.read("retirement", image.path, "classifieds_photos");
      return photo?.body.ownerKind === "ad" && photo.body.ownerId === id && typeof photo.body.reservedRevision === "number"
        ? { ...image, uploadRevision: photo.body.reservedRevision - 1 }
        : image;
    }));
  }
  async function readAd(id: string, includePendingImages = false) {
    const record = await persistence.read("ad", id);
    if (!record || !hasCompletedPublication(data(record))) return null;
    const value = await authorize(record, persistence);
    return { ...value, advertiserProfileId: value.advertiserProfileId ?? "", images: await urls(id, includePendingImages ? await uploadRevisions(id, value.images) : visibleAdImages(value.images)) };
  }
  function profileReader(): Pick<Transaction, "read"> {
    const profiles = new Map<string, Promise<StoredRecord | null>>();
    return { read(kind, id, namespace) {
      if (kind !== "profile") return persistence.read(kind, id, namespace);
      let profile = profiles.get(id);
      if (!profile) {
        profile = persistence.read(kind, id, namespace);
        profiles.set(id, profile);
      }
      return profile;
    } };
  }
  async function listAds(query: Parameters<typeof persistence.page>[0]) {
    const records = (await readAll(query)).items;
    const reader = profileReader();
    const values = [];
    for (const record of records) if (hasCompletedPublication(data(record))) {
      const value = await authorize(record, reader);
      values.push({ ...value, advertiserProfileId: value.advertiserProfileId ?? "", images: await urls(record.id, visibleAdImages(value.images)) });
    }
    return values;
  }
  return { persistence, actorId, now, newId: () => dependencies.newId(), authority, paths, authorize, readAll, ownedAds, cleanup, urls, readAd, profileReader, listAds };
}
