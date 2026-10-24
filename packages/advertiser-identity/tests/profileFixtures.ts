import { createAdvertiserProfiles } from "../profiles";
import type { AdvertiserProfileData } from "../model";
import type { AssociatedAdImageRecord } from "../deletionCleanup";
import { createHash } from "node:crypto";

export function profileFixture(options: { identityTypes?: boolean } = {}) {
  const records = new Map<string, AdvertiserProfileData>();
  let clock = 1000;
  let activityAreasAreActive = true;
  let afterNextRead: (() => Promise<void>) | undefined;
  const profilesWithAds = new Set<string>();
  const associatedAds = new Map<string, AssociatedAdImageRecord[]>();
  const cleanupSkipped: { correlationId: string; count: number }[] = [];
  const identitiesCreated: { actorId: string; identityId: string; identityType?: string }[] = [];
  const creationRequests = new Map<string, { userId?: string | undefined; requestDigest: string }>();
  const context = () => ({
    isActive: async () => activityAreasAreActive,
    ...(options.identityTypes === false
      ? {}
      : {
          personalProfileOf: async (userId: string) => [...records.values()]
            .find(record => record.userId === userId && record.identityType === "personal")?.id ?? null,
        }),
  });
  const profiles = createAdvertiserProfiles({
    now: () => clock,
    digest: value => createHash("sha256").update(value).digest("hex"),
    ownsAdImagePath: (adId, path) => path.startsWith(`ad-images/${adId}/`),
    newCorrelationId: () => "profile-delete-test",
    reportImageCleanupSkipped: input => cleanupSkipped.push(input),
    recordIdentityCreated: input => identitiesCreated.push(input),
    activityAreaCatalog: { isActive: async () => activityAreasAreActive },
    store: {
      async create(record, validate, replay) {
        const id = replay?.id ?? `profile-${records.size}`;
        const operation = creationRequests.get(id);
        if (replay?.decide(operation ? { ...operation, profileExists: records.has(id) } : null) === "replay") return id;
        await validate(context());
        records.set(id, { ...record, id });
        if (replay) creationRequests.set(id, { userId: record.userId, requestDigest: replay.requestDigest });
        return id;
      },
      async update(id, fields, validate, expectedRevision) {
        await validate?.(context());
        const record = records.get(id);
        if (!record) throw new Error("missing");
        const currentRevision = record.revision ?? 1;
        if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
          throw new Error(`O Perfil de anunciante mudou antes da operação. Revisão atual: ${currentRevision}.`);
        }
        records.set(id, { ...record, ...fields, revision: currentRevision + 1 });
      },
      async classify(id, decide) {
        const record = records.get(id) ?? null;
        const decision = await decide(record, context());
        if (record && decision) records.set(id, { ...record, ...decision, revision: (record.revision ?? 1) + 1 });
      },
      async getById(id) {
        const record = records.get(id) ?? null;
        const pending = afterNextRead;
        afterNextRead = undefined;
        await pending?.();
        return record;
      },
      async getByUserId(userId) {
        return [...records.values()].filter(
          record => record.userId === userId,
        );
      },
      async getAll() {
        return [...records.values()].sort((a, b) => b.createdAt - a.createdAt);
      },
      async getByActivityArea(area) {
        return [...records.values()].filter(profile =>
          profile.activityAreas?.some(candidate =>
            candidate.categoryId === area.categoryId
            && candidate.subcategoryId === area.subcategoryId,
          ),
        );
      },
      async updateActivityAreas(id, update) {
        const record = records.get(id);
        if (!record) return;
        records.set(id, {
          ...record,
          activityAreas: update(record.activityAreas ?? []),
        });
      },
      async delete(id, decideCleanup) {
        const result = decideCleanup(associatedAds.get(id) ?? []);
        records.delete(id);
        return { skippedCount: result.skippedCount };
      },
      async deleteClaimable(id, assertDeletionAllowed) {
        const record = records.get(id) ?? null;
        assertDeletionAllowed(record, profilesWithAds.has(id));
        records.delete(id);
      },
    },
  });
  return {
    profiles,
    seedRecord: (record: AdvertiserProfileData) => records.set(record.id, record),
    setHasAds: (id: string) => profilesWithAds.add(id),
    setAssociatedAds: (id: string, ads: AssociatedAdImageRecord[]) => associatedAds.set(id, ads),
    cleanupSkipped,
    identitiesCreated,
    afterNextRead: (callback: () => Promise<void>) => { afterNextRead = callback; },
    setTime: (time: number) => {
      clock = time;
    },
    setActivityAreasAreActive: (isActive: boolean) => {
      activityAreasAreActive = isActive;
    },
  };
}
