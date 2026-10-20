import {
  isClaimableAdvertiserProfile,
  isOwnedAdvertiserProfile,
  type ActivityArea,
  type AdvertiserIdentityType,
  type AdvertiserProfileData,
  type AdvertiserProfileRecord,
  type PublicAdvertiserProfileData,
} from "../model";
import { AdvertiserIdentityTypeConflict, AdvertiserProfileCreationPayloadConflict } from "./profileConflicts";

export interface ActivityAreaCatalog {
  isActive(area: ActivityArea): Promise<boolean>;
}

export class AdvertiserProfileAccessError extends Error {
  constructor(public readonly reason: "not-found" | "forbidden") {
    super(reason === "not-found"
      ? "Profile not found"
      : "Unauthorized: You can only access your own profiles");
    this.name = "AdvertiserProfileAccessError";
  }
}

/**
 * Persistence supplies reads sharing the profile write's transaction. A store
 * without `personalProfileOf` cannot guarantee one personal profile per account,
 * so it accepts only untyped profiles.
 */
export interface ProfileWriteContext extends ActivityAreaCatalog {
  personalProfileOf?(userId: string): Promise<string | null>;
}

export type ValidateProfileWrite = (context: ProfileWriteContext) => Promise<void>;

export async function assertIdentityTypeAvailable(
  context: ProfileWriteContext,
  userId: string,
  identityType: AdvertiserIdentityType | undefined,
): Promise<void> {
  if (identityType === undefined) return;
  if (!context.personalProfileOf) throw new Error("Tipo de identidade indisponível nesta composição.");
  if (identityType === "personal" && await context.personalProfileOf(userId) !== null) {
    throw new AdvertiserIdentityTypeConflict("personal-exists");
  }
}

export interface ProfileCreationReplay {
  id: string;
  requestDigest: string;
  decide(existing: { userId?: string | undefined; requestDigest?: string | undefined; profileExists: boolean } | null): "create" | "replay";
}

export function profileCreationReplay(
  userId: string,
  operationId: string,
  fields: Pick<AdvertiserProfileRecord, "title" | "description" | "contacts" | "activityAreas" | "identityType">,
  digest: (value: string) => string,
): ProfileCreationReplay {
  const id = `owner-${digest(`${userId}:${operationId}`)}`;
  const requestDigest = digest(JSON.stringify({
    title: fields.title,
    description: fields.description,
    contacts: fields.contacts,
    activityAreas: fields.activityAreas,
    identityType: fields.identityType,
  }));
  return {
    id,
    requestDigest,
    decide(existing) {
      if (!existing) return "create";
      if (!existing.profileExists || existing.userId !== userId || existing.requestDigest !== requestDigest) {
        throw new AdvertiserProfileCreationPayloadConflict(id);
      }
      return "replay";
    },
  };
}

export function withoutActivityArea(
  activityAreas: ActivityArea[],
  removed: ActivityArea,
): ActivityArea[] {
  return activityAreas.filter(
    area =>
      area.categoryId !== removed.categoryId
      || area.subcategoryId !== removed.subcategoryId,
  );
}

export function activityAreaCivilDate(timestamp: number): string {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    values.find(value => value.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function normalizedContact(value: string): string {
  return value.replace(/\D/g, "");
}

export function isPubliclyEligible(profile: AdvertiserProfileData): boolean {
  const hasCoherentOwnership = isOwnedAdvertiserProfile(profile)
    || isClaimableAdvertiserProfile(profile);
  return hasCoherentOwnership
    && profile.title.trim().length > 0
    && (profile.contacts?.length ?? 0) > 0;
}

export function toPublicProfile(profile: AdvertiserProfileData): PublicAdvertiserProfileData {
  return {
    id: profile.id,
    title: profile.title || "",
    ...(profile.description !== undefined ? { description: profile.description } : {}),
    ...(profile.contacts !== undefined ? { contacts: profile.contacts } : {}),
    ...(profile.activityAreas !== undefined ? { activityAreas: profile.activityAreas } : {}),
    ...(profile.photoURL !== undefined ? { photoURL: profile.photoURL } : {}),
    ...(isClaimableAdvertiserProfile(profile) ? { isClaimable: true as const } : {}),
  };
}
