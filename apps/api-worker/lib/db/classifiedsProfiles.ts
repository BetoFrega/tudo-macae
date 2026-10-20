import { z } from "zod";
import { createAdvertiserProfiles, AdvertiserIdentityTypeConflict, AdvertiserProfileAccessError, AdvertiserProfileRevisionConflict, type ProfileWriteContext } from "@tudomacae/advertiser-identity/profiles";
import { isOwnedAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";
import { PersistenceConflict, type ClassifiedsPersistence, type Transaction } from "@tudomacae/classifieds-persistence";
import { allRecords, activityAreaActive, jsonValue, parseStored, profileData } from "./classifiedsSupport";

type ProfileStore = Parameters<typeof createAdvertiserProfiles>[0]["store"];

/** The owner query guards the whole profile kind, so any concurrent profile write retries the decision. */
export async function personalProfileIdOf(tx: Transaction, userId: string) {
  const owned = await allRecords(tx, { kind: "profile", ownerId: userId });
  return owned.items.find(record => record.body.identityType === "personal")?.id ?? null;
}

function writeContext(tx: Transaction): ProfileWriteContext {
  return {
    isActive: area => activityAreaActive(tx, area),
    personalProfileOf: userId => personalProfileIdOf(tx, userId),
  };
}

/**
 * Index `classifieds_personal_profile_owner` backs the transactional check only where migration 0013 is applied; read it
 * back before exposure. The index ignores untyped legacy and imported profiles, which stay untyped until "Definir tipo".
 */
export function isPersonalProfileIndexViolation(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed: (classifieds_records\.owner_id|index 'classifieds_personal_profile_owner')/.test(error.message);
}

async function personalProfileUnique<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  }
  catch (error) {
    if (isPersonalProfileIndexViolation(error)) throw new AdvertiserIdentityTypeConflict("personal-exists");
    throw error;
  }
}
export function createClassifiedsProfileStore(dependencies: {
  persistence: ClassifiedsPersistence; actorId: string; admin?: boolean; now(): number; newId(): string;
  photoUrl?(path: string): string;
}): ProfileStore {
  const store = dependencies.persistence;
  const map = (record: Parameters<typeof profileData>[0]) => profileData(record, dependencies.photoUrl);
  return {
    async create(record, validate, replay) {
      const id = replay?.id ?? dependencies.newId();
      return z.string().parse((await personalProfileUnique(() => store.transact(null, async (tx) => {
        const existing = await tx.read("profile", id);
        if (replay) {
          const operation = await tx.read("operation", replay.id, "advertiser_profile_creation_operations");
          if (operation) {
            replay.decide({ userId: parseStored(z.string().optional(), operation.body.userId), requestDigest: parseStored(z.string().optional(), operation.body.requestDigest), profileExists: existing !== null });
            return id;
          }
          if (existing) {
            replay.decide({ userId: parseStored(z.string().optional(), existing.body.userId), requestDigest: parseStored(z.string().optional(), existing.body.creationRequestDigest), profileExists: true });
            tx.put({ kind: "operation", id: replay.id, namespace: "advertiser_profile_creation_operations", body: { userId: record.userId!, requestDigest: replay.requestDigest } });
            return id;
          }
        }
        if (existing) throw new PersistenceConflict();
        await validate(writeContext(tx));
        tx.put({ kind: "profile", id, body: z.record(z.string(), z.json()).parse(jsonValue({ ...record, ...(replay ? { creationRequestDigest: replay.requestDigest } : {}) })) });
        if (replay) tx.put({ kind: "operation", id: replay.id, namespace: "advertiser_profile_creation_operations", body: { userId: record.userId!, requestDigest: replay.requestDigest } });
        return id;
      }))).value);
    },
    async update(id, fields, validate, expectedRevision) {
      await store.transact(null, async (tx) => {
        const current = await tx.read("profile", id);
        if (!current) throw new AdvertiserProfileAccessError("not-found");
        const profile = map(current);
        // The owner is immutable in this slice; it must still match at commit.
        if (!isOwnedAdvertiserProfile(profile) || (profile.userId !== dependencies.actorId && !dependencies.admin)) throw new AdvertiserProfileAccessError("forbidden");
        if (expectedRevision !== undefined && expectedRevision !== profile.revision) throw new AdvertiserProfileRevisionConflict(profile.revision ?? 1);
        if (validate) await validate(writeContext(tx));
        tx.put({ ...current, body: z.record(z.string(), z.json()).parse(jsonValue({ ...current.body, ...fields })) });
        return null;
      });
    },
    async classify(id, decide) {
      await personalProfileUnique(() => store.transact(null, async (tx) => {
        const current = await tx.read("profile", id);
        const decision = await decide(current ? map(current) : null, writeContext(tx));
        if (current && decision) tx.put({ ...current, body: { ...current.body, ...decision } });
        return null;
      }));
    },
    async getById(id) {
      const record = await store.read("profile", id);
      return record ? map(record) : null;
    },
    async getByUserId(userId) { return (await allRecords(store, { kind: "profile", ownerId: userId })).items.map(map); },
    async getAll() { return (await allRecords(store, { kind: "profile", order: "createdDesc" })).items.map(map); },
    async getByActivityArea(activityArea: ActivityArea) { return (await allRecords(store, { kind: "profile", activityArea })).items.map(map); },
    async updateActivityAreas(id, update) {
      const now = dependencies.now();
      await store.transact(null, async (tx) => {
        const current = await tx.read("profile", id);
        if (!current) return null;
        const previous = map(current).activityAreas ?? [];
        const activityAreas = update(previous);
        if (JSON.stringify(activityAreas) !== JSON.stringify(previous)) tx.put({ ...current, body: { ...current.body, activityAreas: activityAreas.map(area => ({ ...area })), updatedAt: now } });
        return null;
      });
    },
    async delete(id, decideCleanup, now, correlationId) {
      const manifest = await store.manifest(id, now);
      if (!manifest.profile) throw new AdvertiserProfileAccessError("not-found");
      const ads = await allRecords(store, { kind: "ad", profileId: id }, manifest.version);
      const imageRecord = z.object({
        id: z.string(), images: z.array(z.object({ path: z.string().optional(), pending: z.boolean().optional() })).optional(),
        pendingImageCleanupPaths: z.array(z.string()).optional(), pendingImageCleanupClaims: z.array(z.string()).optional(),
        pendingImageUploadReservations: z.array(z.object({ path: z.string(), expiresAt: z.number().optional() })).optional(),
      });
      const cleanup = decideCleanup(ads.items.map(record => parseStored(imageRecord, { ...record.body, id: record.id })));
      await store.deleteIdentity({ profileId: id, expectedVersion: manifest.version, now,
        intent: { actorId: dependencies.actorId, key: correlationId, operation: "profile.deleteOwned", input: { id } },
        audit: { reason: "Exclusão solicitada pelo titular.", channel: "administration" }, result: { skippedCount: cleanup.skippedCount }, correlationId });
      return { skippedCount: cleanup.skippedCount };
    },
    async deleteClaimable(id, assertDeletionAllowed) {
      await store.transact(null, async (tx) => {
        const current = await tx.read("profile", id);
        const ads = await tx.page({ kind: "ad", profileId: id, limit: 1 });
        assertDeletionAllowed(current ? map(current) : null, ads.items.length > 0);
        await tx.read("catalog", id);
        tx.remove("profile", id);
        tx.remove("catalog", id);
        return null;
      });
    },
  };
}
