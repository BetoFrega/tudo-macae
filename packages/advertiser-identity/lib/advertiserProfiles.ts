import {
  isClaimableAdvertiserProfile,
  isOwnedAdvertiserProfile,
  type ActivityArea,
  type AdvertiserIdentityType,
  type AdvertiserProfileData,
  type AdvertiserProfileRecord,
  type PublicAdvertiserProfileData,
} from "../model";
import {
  activityAreaSchema,
  claimableAdvertiserProfileSchema,
  classifyAdvertiserProfileSchema,
  createAdvertiserProfileSchema,
  getAdvertiserProfileSchema,
  updateAdvertiserProfileSchema,
  updateClaimableAdvertiserProfileSchema,
  type CreateAdvertiserProfileInput,
  type ClaimableAdvertiserProfileInput,
  type ClassifyAdvertiserProfileInput,
  type UpdateAdvertiserProfileInput,
  type UpdateClaimableAdvertiserProfileInput,
} from "./validation";
import {
  AdvertiserProfileAccessError,
  activityAreaCivilDate,
  assertIdentityTypeAvailable,
  isPubliclyEligible,
  normalizedContact,
  normalizedName,
  profileCreationReplay,
  toPublicProfile,
  trackedCreationReplay,
  withoutActivityArea,
  type ActivityAreaCatalog,
  type ProfileCreationReplay,
  type ProfileWriteContext,
  type ValidateProfileWrite,
} from "./advertiserProfileRules";
import { AdvertiserIdentityTypeConflict } from "./profileConflicts";
import { deterministicRotationScore } from "./deterministicRotation";
import { profileDeletionImageCleanup, type AssociatedAdImageRecord } from "../deletionCleanup";
import { z } from "zod";

interface ProfileStore {
  create(
    record: AdvertiserProfileRecord & { createdAt: number; updatedAt: number },
    validate: ValidateProfileWrite,
    replay?: ProfileCreationReplay,
  ): Promise<string>;
  update(
    id: string,
    fields: Partial<Omit<AdvertiserProfileRecord, "userId">> & {
      updatedAt: number;
    },
    validate?: ValidateProfileWrite,
    expectedRevision?: number,
  ): Promise<void>;
  /** Applies a non-null decision to the profile read in the same transaction. */
  classify(
    id: string,
    decide: (
      current: AdvertiserProfileData | null,
      context: ProfileWriteContext,
    ) => Promise<{ identityType: AdvertiserIdentityType; updatedAt: number } | null>,
  ): Promise<void>;
  getById(id: string): Promise<AdvertiserProfileData | null>;
  getByUserId(userId: string): Promise<AdvertiserProfileData[]>;
  getAll(): Promise<AdvertiserProfileData[]>;
  getByActivityArea(area: ActivityArea): Promise<AdvertiserProfileData[]>;
  updateActivityAreas(
    id: string,
    update: (current: ActivityArea[]) => ActivityArea[],
  ): Promise<void>;
  delete(
    id: string,
    decideCleanup: (records: readonly AssociatedAdImageRecord[]) => { jobs: { adId: string; path: string; dueAt?: number; writerCompleted?: true }[]; skippedCount: number },
    now: number,
    correlationId: string,
  ): Promise<{ skippedCount: number } | void>;
  deleteClaimable(
    id: string,
    assertDeletionAllowed: (
      profile: AdvertiserProfileData | null,
      hasAssociatedAds: boolean,
    ) => void,
  ): Promise<void>;
}

export function createAdvertiserProfiles(dependencies: {
  store: ProfileStore;
  now(): number;
  digest(value: string): string;
  ownsAdImagePath(adId: string, path: string): boolean;
  newCorrelationId(): string;
  reportImageCleanupSkipped(input: { correlationId: string; count: number }): void;
  activityAreaCatalog: ActivityAreaCatalog;
  /** Runs after the write commits, once per identity an account creates; a replayed creation does not call it. */
  recordIdentityCreated?(input: { actorId: string; identityId: string; identityType?: AdvertiserIdentityType }): void;
}) {
  const validateActivityAreas = (areas: ActivityArea[]): ValidateProfileWrite => async (catalog) => {
    for (const area of areas) {
      if (!(await catalog.isActive(area))) {
        throw new TypeError("Categoria ou subcategoria inválida ou inativa");
      }
    }
  };
  const read = async ({ id }: { id: string }) =>
    dependencies.store.getById(getAdvertiserProfileSchema.parse({ id }).id);
  const verifyOwnership = async (input: { id: string; userId: string }) => {
    const profile = await read(input);
    if (!profile || !isOwnedAdvertiserProfile(profile)) throw new AdvertiserProfileAccessError("not-found");
    if (profile.userId !== input.userId)
      throw new AdvertiserProfileAccessError("forbidden");
    return profile;
  };
  return {
    async create(input: CreateAdvertiserProfileInput & { userId: string; operationId?: string }) {
      const fields = createAdvertiserProfileSchema.parse({
        title: input.title,
        description: input.description,
        contacts: input.contacts,
        activityAreas: input.activityAreas,
        identityType: input.identityType,
      });
      const activityAreas = fields.activityAreas ?? [];
      const now = dependencies.now();
      const record = {
        userId: input.userId,
        title: fields.title,
        description: fields.description || "",
        contacts: fields.contacts,
        activityAreas,
        ...(fields.identityType ? { identityType: fields.identityType } : {}),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      const creation = trackedCreationReplay(input.operationId ? profileCreationReplay(input.userId, input.operationId, record, dependencies.digest) : undefined);
      const validateAreas = validateActivityAreas(activityAreas);
      const id = await dependencies.store.create(record, async (context) => {
        await assertIdentityTypeAvailable(context, input.userId, fields.identityType);
        await validateAreas(context);
      }, creation.replay);
      if (!creation.replayed()) dependencies.recordIdentityCreated?.({ actorId: input.userId, identityId: id, ...(fields.identityType ? { identityType: fields.identityType } : {}) });
      return id;
    },
    async classify(input: ClassifyAdvertiserProfileInput) {
      const value = classifyAdvertiserProfileSchema.parse(input);
      await dependencies.store.classify(value.id, async (profile, context) => {
        if (!profile || !isOwnedAdvertiserProfile(profile)) throw new AdvertiserProfileAccessError("not-found");
        if (profile.userId !== value.userId) throw new AdvertiserProfileAccessError("forbidden");
        if (profile.identityType === value.identityType) return null;
        if (profile.identityType) throw new AdvertiserIdentityTypeConflict("already-classified");
        await assertIdentityTypeAvailable(context, value.userId, value.identityType);
        return { identityType: value.identityType, updatedAt: dependencies.now() };
      });
    },
    async createClaimable(input: ClaimableAdvertiserProfileInput) {
      const fields = claimableAdvertiserProfileSchema.parse(input);
      const now = dependencies.now();
      return dependencies.store.create({
        claimable: true,
        source: { url: fields.sourceUrl, checkedAt: now },
        title: fields.title,
        description: fields.description || "",
        contacts: fields.contacts,
        activityAreas: fields.activityAreas,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }, validateActivityAreas(fields.activityAreas));
    },
    async update(input: UpdateAdvertiserProfileInput) {
      const fields = updateAdvertiserProfileSchema.parse(input);
      await dependencies.store.update(fields.id, {
        title: fields.title,
        description: fields.description || "",
        ...(fields.contacts !== undefined ? { contacts: fields.contacts } : {}),
        ...(fields.activityAreas !== undefined ? { activityAreas: fields.activityAreas } : {}),
        updatedAt: dependencies.now(),
      }, fields.activityAreas === undefined
        ? undefined
        : validateActivityAreas(fields.activityAreas), fields.expectedRevision);
    },
    async updateClaimable(input: UpdateClaimableAdvertiserProfileInput) {
      const fields = updateClaimableAdvertiserProfileSchema.parse(input);
      const profile = await read({ id: fields.id });
      if (!profile) throw new Error("Perfil de anunciante não encontrado.");
      if (!isClaimableAdvertiserProfile(profile)) {
        throw new Error("Este perfil não é reivindicável.");
      }
      const now = dependencies.now();
      await dependencies.store.update(fields.id, {
        source: { url: fields.sourceUrl, checkedAt: now },
        title: fields.title,
        description: fields.description || "",
        contacts: fields.contacts,
        activityAreas: fields.activityAreas,
        updatedAt: now,
      }, validateActivityAreas(fields.activityAreas));
    },
    read,
    verifyOwnership,
    async readPublic(input: {
      id: string;
    }): Promise<PublicAdvertiserProfileData | null> {
      const profile = await read(input);
      if (!profile) return null;
      if (
        !isOwnedAdvertiserProfile(profile)
        && !isClaimableAdvertiserProfile(profile)
      ) return null;
      return toPublicProfile(profile);
    },
    async listForUser(userId: string) {
      return (await dependencies.store.getByUserId(userId))
        .filter(isOwnedAdvertiserProfile);
    },
    listAll: () => dependencies.store.getAll(),
    async findDuplicateCandidates(input: {
      title: string;
      contacts: { number: string; isWhatsapp?: boolean }[];
    }) {
      const validated = z.object({
        title: z.string().min(1),
        contacts: z.array(z.object({ number: z.string().min(1) })).min(1),
      }).parse(input);
      const title = normalizedName(validated.title);
      const contacts = new Set(validated.contacts.map(contact => normalizedContact(contact.number)));
      return (await dependencies.store.getAll()).filter(profile =>
        normalizedName(profile.title) === title
        || profile.contacts?.some(contact => contacts.has(normalizedContact(contact.number))),
      );
    },
    async removeActivityArea(area: ActivityArea) {
      const validatedArea = activityAreaSchema.parse(area);
      const associatedProfiles = await dependencies.store.getByActivityArea(
        validatedArea,
      );

      for (const profile of associatedProfiles) {
        await dependencies.store.updateActivityAreas(profile.id, current =>
          withoutActivityArea(current, validatedArea));
      }
    },
    async listForActivityArea(input: ActivityArea & { civilDate?: string }) {
      const area = activityAreaSchema.parse(input);
      const civilDate = input.civilDate ?? activityAreaCivilDate(dependencies.now());

      if (!(await dependencies.activityAreaCatalog.isActive(area))) return [];

      return (await dependencies.store.getByActivityArea(area))
        .filter(isPubliclyEligible)
        .sort((left, right) => {
          const leftHash = deterministicRotationScore(
            `${civilDate}:${area.categoryId}:${area.subcategoryId}:${left.id}`,
          );
          const rightHash = deterministicRotationScore(
            `${civilDate}:${area.categoryId}:${area.subcategoryId}:${right.id}`,
          );
          return leftHash - rightHash || left.id.localeCompare(right.id);
        })
        .slice(0, 6)
        .map(toPublicProfile);
    },
    delete: async (input: { id: string }) => {
      const correlationId = dependencies.newCorrelationId();
      const now = dependencies.now();
      const result = await dependencies.store.delete(
        input.id,
        records => profileDeletionImageCleanup(records, dependencies.ownsAdImagePath, now),
        now,
        correlationId,
      );
      if (result?.skippedCount) dependencies.reportImageCleanupSkipped({ correlationId, count: result.skippedCount });
    },
    deleteClaimable: (input: { id: string }) => dependencies.store.deleteClaimable(
      getAdvertiserProfileSchema.parse(input).id,
      (profile, hasAssociatedAds) => {
        if (!profile) throw new Error("Perfil de anunciante não encontrado.");
        if (!isClaimableAdvertiserProfile(profile)) {
          throw new Error("Este perfil não é reivindicável.");
        }
        if (hasAssociatedAds) {
          throw new Error("Este perfil possui anúncios associados e não pode ser excluído.");
        }
      },
    ),
    async replacePhoto(input: { id: string; photoPath: string; expectedRevision: number }) {
      const profile = await read(input);
      if (!profile) throw new Error("Profile not found");
      await dependencies.store.update(input.id, {
        photoPath: input.photoPath,
        updatedAt: dependencies.now(),
      }, undefined, input.expectedRevision);
    },
  };
}
