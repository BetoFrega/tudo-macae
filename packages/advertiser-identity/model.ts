export interface ActivityArea {
  categoryId: string;
  subcategoryId: string;
}

export type AdvertiserIdentityType = "personal" | "business";

export interface AdvertiserProfileRecord {
  userId?: string;
  /** Fixed once confirmed; owned legacy profiles stay untyped until classified. */
  identityType?: AdvertiserIdentityType;
  claimable?: true;
  source?: {
    url: string;
    checkedAt: number;
  };
  title: string;
  description: string;
  photoPath?: string;
  contacts?: { number: string; isWhatsapp: boolean }[];
  activityAreas?: ActivityArea[];
  revision?: number;
}

export interface AdvertiserProfileData extends AdvertiserProfileRecord {
  id: string;
  /** Monotonic profile-wide write revision. Legacy records resolve to 1. */
  revision?: number;
  createdAt: number;
  updatedAt: number;
  /** Generated URL from photoPath - computed at runtime */
  photoURL?: string;
}

export interface PublicAdvertiserProfileData {
  id: string;
  title: string;
  description?: string;
  /** Generated URL from photoPath - computed at runtime */
  photoURL?: string;
  contacts?: { number: string; isWhatsapp: boolean }[];
  activityAreas?: ActivityArea[];
  isClaimable?: true;
}

export function isClaimableAdvertiserProfile(
  profile: AdvertiserProfileData,
): boolean {
  if (profile.claimable !== true) return false;
  if (profile.userId !== undefined || typeof profile.source?.url !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(profile.source.url).protocol)
      && Number.isFinite(profile.source.checkedAt);
  }
  catch {
    return false;
  }
}

export function isOwnedAdvertiserProfile(
  profile: AdvertiserProfileData,
): boolean {
  return Boolean(profile.userId?.trim())
    && profile.claimable !== true
    && profile.source === undefined;
}

export function identityTypeOf(
  profile: AdvertiserProfileData,
): AdvertiserIdentityType | undefined {
  return profile.identityType ?? (isClaimableAdvertiserProfile(profile) ? "business" : undefined);
}

/** A personal profile never changes owner; an untyped one needs classification first. */
export function isTransferableAdvertiserProfile(
  profile: AdvertiserProfileData,
): boolean {
  return identityTypeOf(profile) === "business";
}
