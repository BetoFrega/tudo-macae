import { z } from "zod";
import { AdvertiserProfileAdministrationError, advertiserProfileAdministrationState, type AdvertiserProfileMutationResult } from "./administration";
import type { AdvertiserProfileData } from "./model";
import { ownedProfileDeletionPhoto, profileDeletionImageCleanup, ProfileDeletionImageCleanupBlocked, type AssociatedAdImageRecord } from "./deletionCleanup";

export const identityDeletionCacheTag = "ads-identity-deletion";

export const previewAdvertiserIdentityDeletionSchema = z.strictObject({ id: z.string().trim().min(1) });
export const deleteAdvertiserIdentitySchema = previewAdvertiserIdentityDeletionSchema.extend({
  confirmationToken: z.string().min(1),
  confirmedTitle: z.string().max(100),
  reason: z.string().trim().min(1, "Informe o motivo da exclusão.").max(1000),
  idempotencyKey: z.string().trim().min(1),
});
const actorShape = {
  actorId: z.string().trim().min(1),
  channel: z.literal("administration"),
  correlationId: z.string().trim().min(1).optional(),
};
export const previewAdvertiserIdentityDeletionAdministrationSchema = previewAdvertiserIdentityDeletionSchema.extend(actorShape);
export const deleteAdvertiserIdentityAdministrationSchema = deleteAdvertiserIdentitySchema.extend(actorShape);
export type IdentityDeletionInput = z.output<typeof deleteAdvertiserIdentityAdministrationSchema>;
export interface IdentityDeletionSnapshot {
  profile: AdvertiserProfileData | null;
  ads: Array<AssociatedAdImageRecord & { title: string; status: string; categoryId: string; subcategoryId?: string }>;
  catalogItems: { id: string; name: string }[];
  evidence: string;
}
export interface IdentityDeletionPreview {
  profileId: string;
  title: string;
  ads: { id: string; title: string; status: string }[];
  catalogItems: { id: string; name: string }[];
  confirmationToken: string;
}
export interface IdentityDeletionResult extends AdvertiserProfileMutationResult {
  cacheTags: string[];
  deletedAds: number;
  imageCleanupSkippedCount?: number;
}
export interface IdentityDeletionPlan {
  result: IdentityDeletionResult;
  imageCleanup: ReturnType<typeof profileDeletionImageCleanup>;
  ownedPhotoPath?: string;
}
export interface IdentityDeletionStore {
  read(id: string): Promise<IdentityDeletionSnapshot>;
  delete(input: IdentityDeletionInput, decide: (snapshot: IdentityDeletionSnapshot) => IdentityDeletionPlan): Promise<IdentityDeletionResult>;
}

export function createAdvertiserIdentityDeletion(dependencies: {
  store: IdentityDeletionStore;
  digest(value: string): string;
  ownsImagePath(adId: string, path: string): boolean;
  now(): number;
  reportImageCleanupSkipped(input: { correlationId: string; count: number }): void;
}) {
  function preview(snapshot: IdentityDeletionSnapshot, actorId: string): IdentityDeletionPreview {
    if (!snapshot.profile) throw new AdvertiserProfileAdministrationError("notFound", "Perfil não encontrado.");
    if (!advertiserProfileAdministrationState(snapshot.profile)) {
      throw new AdvertiserProfileAdministrationError("invalidProfileState", "O perfil possui estado incoerente.");
    }
    return {
      profileId: snapshot.profile.id,
      title: snapshot.profile.title || snapshot.profile.id,
      ads: snapshot.ads.map(({ id, title, status }) => ({ id, title, status })),
      catalogItems: snapshot.catalogItems,
      confirmationToken: dependencies.digest(JSON.stringify({ actorId, evidence: snapshot.evidence })),
    };
  }
  return {
    async preview(input: unknown) {
      const value = previewAdvertiserIdentityDeletionAdministrationSchema.parse(input);
      return preview(await dependencies.store.read(value.id), value.actorId);
    },
    async delete(input: unknown) {
      const value = deleteAdvertiserIdentityAdministrationSchema.parse(input);
      const result = await dependencies.store.delete(value, (snapshot) => {
        const current = preview(snapshot, value.actorId);
        if (current.confirmationToken !== value.confirmationToken || current.title !== value.confirmedTitle) {
          throw new AdvertiserProfileAdministrationError("revisionConflict", "O perfil ou seu conteúdo mudou. Confira uma nova prévia antes de excluir.");
        }
        const profile = snapshot.profile!;
        let imageCleanup: IdentityDeletionPlan["imageCleanup"];
        try {
          imageCleanup = profileDeletionImageCleanup(snapshot.ads, dependencies.ownsImagePath, dependencies.now());
        }
        catch (error) {
          if (error instanceof ProfileDeletionImageCleanupBlocked) {
            throw new AdvertiserProfileAdministrationError("imageCleanupBlocked", error.message);
          }
          throw error;
        }
        return {
          ...(ownedProfileDeletionPhoto(profile.id, profile.photoPath) ? { ownedPhotoPath: profile.photoPath } : {}),
          imageCleanup,
          result: {
            outcome: "deleted",
            replayed: false,
            profileId: profile.id,
            revision: (profile.revision ?? 1) + 1,
            effects: { previousActivityAreas: profile.activityAreas ?? [], activityAreas: [] },
            deletedAds: snapshot.ads.length,
            ...(imageCleanup.skippedCount ? { imageCleanupSkippedCount: imageCleanup.skippedCount } : {}),
            cacheTags: [
              "ads", identityDeletionCacheTag, `advertiser-profile-${profile.id}`, `ads-by-profile-${profile.id}`,
            ],
          },
        };
      });
      if (!result.replayed && result.imageCleanupSkippedCount) {
        dependencies.reportImageCleanupSkipped({
          correlationId: value.correlationId ?? dependencies.digest(`${value.actorId}:${value.idempotencyKey}`),
          count: result.imageCleanupSkippedCount,
        });
      }
      return result;
    },
  };
}
