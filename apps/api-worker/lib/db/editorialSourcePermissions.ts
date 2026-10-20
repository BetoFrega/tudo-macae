import { z } from "zod";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { sourcePermissionCapabilities } from "@tudomacae/editorial-sourcing/sourcePermissionCapabilities";
import { sourcePermissionIsValidAt } from "@tudomacae/editorial-sourcing/sourcePermissionPolicy";
import { parseStoredMedia } from "./editorialMedia";

const permissionSchema = z.looseObject({ capability: z.enum(sourcePermissionCapabilities), validFrom: z.number(), expiresAt: z.number() });
const revocationSchema = z.looseObject({ revokedAt: z.number() });

/**
 * Source Permissions belong to the retired Redação and reach the D1 only as imported `legacy` records,
 * so nothing here grants or revokes them; reads outside a transaction cannot race a writer.
 */
export function createLegacySourcePermissions(persistence: Pick<EditorialPersistence, "read">) {
  return {
    async hasMediaUsePermission(permissionId: string, at: number) {
      if (!permissionId || permissionId.length > 500 || permissionId.includes("/")) return false;
      const [permission, revocation] = await Promise.all([
        persistence.read("legacy", permissionId, "news_source_permissions"),
        persistence.read("legacy", permissionId, "news_source_permission_revocations"),
      ]);
      if (!permission) return false;
      return sourcePermissionIsValidAt(
        parseStoredMedia(permissionSchema, permission.body),
        revocation ? parseStoredMedia(revocationSchema, revocation.body) : undefined,
        "mediaUse", at,
      );
    },
  };
}
