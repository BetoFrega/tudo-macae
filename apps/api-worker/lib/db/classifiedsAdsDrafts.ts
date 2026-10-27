import { z } from "zod";
import { personalProfileExistsMessage, type PublicationDraftTransaction, type PublicationDraftStore, type PublicationRecord } from "@tudomacae/ads/publicationDrafts";
import { AdOperationError } from "@tudomacae/ads/operationError";
import type { AdMutationStore } from "@tudomacae/ads/adMutations";
import { hasPendingPublication } from "@tudomacae/ads/visibility";
import type { StoredRecord, Transaction, RecordBody } from "@tudomacae/classifieds-persistence";
import { activityAreaActive, parseStored } from "./classifiedsSupport";
import { isPersonalProfileIndexViolation, personalProfileIdOf } from "./classifiedsProfiles";
import { body, data, forbidden } from "./classifiedsAdsRecords";
import type { ClassifiedsAdContext } from "./classifiedsAdsContext";

export function draftTransaction(context: ClassifiedsAdContext, tx: Transaction, id: string) {
  const { actorId, authority, authorize, cleanup, now } = context;
  let ad: StoredRecord | null;
  let replacement: RecordBody | undefined;
  let removed = false;
  const profiles = new Map<string, StoredRecord | null>();
  const profileWrites = new Map<string, RecordBody>();
  const port: PublicationDraftTransaction = {
    async read() {
      ad = await tx.read("ad", id);
      if (!ad) {
        if (await tx.read("retirement", id, "ad_deletions")) forbidden();
        return null;
      }
      await authorize(ad, tx, false);
      return { ...data({ ...ad, body: replacement ?? ad.body }) } as PublicationRecord;
    },
    async readProfile(profileId) {
      const record = await tx.read("profile", profileId);
      profiles.set(profileId, record);
      if (record) authority.profile(record.body, actorId);
      return record ? parseStored(z.object({ userId: z.string().optional(), title: z.unknown(), contacts: z.unknown(), revision: z.number().default(1), activityAreas: z.array(z.object({ categoryId: z.string(), subcategoryId: z.string() })).optional() }), record.body) : null;
    },
    personalProfileOf: userId => personalProfileIdOf(tx, userId),
    isActivityAreaActive: area => activityAreaActive(tx, area),
    saveProfile(profileId, profile) {
      profileWrites.set(profileId, body({ ...profiles.get(profileId)?.body, ...profile }));
      replacement = body({ ...ad?.body, ...replacement, advertiserProfileId: profileId });
    },
    save(record) {
      replacement = body(record);
      delete replacement.id;
    },
    updatePublication(fields) { replacement = body({ ...ad?.body, ...replacement, ...fields }); },
    deletePublication() { removed = true; },
  };
  return { port, async flush() {
    for (const [profileId, fields] of profileWrites) tx.put({ kind: "profile", id: profileId, body: fields });
    if (removed && ad) {
      await tx.read("retirement", id, "ad_deletions");
      tx.put({ kind: "retirement", id, namespace: "ad_deletions", body: { userId: actorId, deletedAt: now() } });
      const value = data(ad);
      await cleanup(tx, id, [...value.images.map(image => image.path), ...value.pendingImageCleanupPaths ?? [], ...value.pendingImageCleanupClaims ?? [], ...(value.pendingImageUploadReservations ?? []).map(item => item.path)]);
      tx.remove("ad", id);
    }
    else if (replacement) tx.put({ kind: "ad", id, body: { ...replacement, revision: Number(ad?.body.revision ?? 1) + 1 } });
  } };
}

export function createDraftStore(context: ClassifiedsAdContext): PublicationDraftStore {
  const { persistence, actorId, authority, authorize, ownedAds, profileReader } = context;
  return {
    async read(id) {
      const record = await persistence.read("ad", id);
      if (!record) return null;
      await authorize(record, persistence, false);
      const value = data(record);
      const images = await Promise.all(value.images.map(async (image) => {
        if (!image.pending) return image;
        const photo = await persistence.read("retirement", image.path, "classifieds_photos");
        return photo?.body.ownerId === id && typeof photo.body.reservedRevision === "number" ? { ...image, uploadRevision: photo.body.reservedRevision - 1 } : image;
      }));
      return { ...value, images } as PublicationRecord;
    },
    async list(userId) {
      authority.owner(userId, false);
      const records = await ownedAds(actorId);
      const reader = profileReader();
      const values: PublicationRecord[] = [];
      for (const record of records) if (hasPendingPublication(record.body)) {
        await authorize(record, reader, false);
        values.push(data(record) as PublicationRecord);
      }
      return values;
    },
    async transact<T>(id: string, decide: (tx: PublicationDraftTransaction) => Promise<T>) {
      let result: T;
      try {
        await persistence.transact(null, async (tx) => {
          const adapter = draftTransaction(context, tx, id);
          result = await decide(adapter.port);
          await adapter.flush();
          return null;
        });
      }
      catch (error) {
        if (isPersonalProfileIndexViolation(error)) throw new AdOperationError("conflict", personalProfileExistsMessage);
        throw error;
      }
      return result!;
    },
  };
}

export function createMutationStore(context: ClassifiedsAdContext): AdMutationStore {
  const { persistence, actorId, authority, authorize, cleanup } = context;
  return {
    async transact(id, decide) {
      await persistence.transact(null, async (tx) => {
        const changes: { record?: StoredRecord | null; fields?: RecordBody } = {};
        await decide({
          async read() {
            changes.record = await tx.read("ad", id);
            return changes.record ? authorize(changes.record, tx) : null;
          },
          async readProfile(profileId) {
            const profile = await tx.read("profile", profileId);
            if (profile) authority.profile(profile.body, actorId, true);
            return profile?.body;
          },
          async readRetiredPaths(paths) {
            const retired: string[] = [];
            for (const path of paths) {
              const photo = await tx.read("retirement", path, "classifieds_photos");
              if (photo && ["retiring", "retired"].includes(String(photo.body.status))) retired.push(path);
            }
            return retired;
          },
          update(value) { changes.fields = body(value); },
        });
        const { record, fields } = changes;
        if (record && fields) {
          const current = data(record);
          authority.mutate(current, typeof fields.status === "string" ? fields.status : undefined);
          const pendingCleanup = z.array(z.string()).parse(fields.pendingImageCleanupPaths ?? current.pendingImageCleanupPaths ?? []);
          await cleanup(tx, id, pendingCleanup);
          // Durable jobs own cleanup after this commit; ad metadata retains no job history.
          if (pendingCleanup.length || fields.pendingImageCleanupPaths) fields.pendingImageCleanupPaths = [];
          delete fields.completedWriterPaths;
          tx.put({ ...record, body: { ...record.body, ...fields, revision: current.revision + 1 } });
        }
        return null;
      });
    },
  };
}
