import { z } from "zod";
import { deleteAdvertiserIdentitySchema } from "@tudomacae/advertiser-identity/identityDeletion";
import { advertiserProfileAuditRetentionMs } from "@tudomacae/advertiser-identity/administration";
import { ownedProfileDeletionPhoto, profileDeletionCleanupPolicy, ProfileDeletionImageCleanupBlocked } from "@tudomacae/advertiser-identity/deletionCleanup";
import { IdentityCleanupBlocked, type IdentityManifest } from "./index";

export function createClassifiedsDeletionPolicy(ownsProfilePhoto: (id: string, path: string) => boolean | Promise<boolean> = (id, path) => !!ownedProfileDeletionPhoto(id, path)) {
  return {
    audit(value: unknown) {
      return z.object({ reason: deleteAdvertiserIdentitySchema.shape.reason, channel: z.enum(["administration", "mcp"]).optional() }).parse(value);
    },
    async plan(manifest: IdentityManifest, now: number) {
      try {
        const effects = profileDeletionCleanupPolicy(manifest, now);
        const photoPath = manifest.profile?.body.photoPath;
        const auditExpiresAt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(now + advertiserProfileAuditRetentionMs);
        const ownedPhotoPath = manifest.profile && typeof photoPath === "string" && await ownsProfilePhoto(manifest.profile.id, photoPath) ? photoPath : undefined;
        return { ...effects, auditExpiresAt, ownedPhotoPath };
      }
      catch (error) {
        if (error instanceof ProfileDeletionImageCleanupBlocked) throw new IdentityCleanupBlocked(error.message);
        throw error;
      }
    },
  };
}
