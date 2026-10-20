import {
  isClaimableAdvertiserProfile,
  isOwnedAdvertiserProfile,
  type ActivityArea,
  type AdvertiserProfileData,
} from "../model";

export interface BusinessPublicData {
  id: string;
  title: string;
  description?: string;
  photoURL?: string;
  contacts?: { number: string; isWhatsapp: boolean }[];
  activityAreas: ActivityArea[];
  isClaimable?: true;
}

export type BusinessReadinessGap = "identity" | "name" | "contact" | "activityArea";

export interface BusinessReadiness {
  business: BusinessPublicData | null;
  missing: BusinessReadinessGap[];
}

export interface BusinessCatalogPosition {
  normalizedTitle: string;
  id: string;
}

export interface BusinessCatalogCandidatePage {
  items: Array<{
    profile: AdvertiserProfileData;
    position: BusinessCatalogPosition;
  }>;
  next?: BusinessCatalogPosition;
}

export interface BusinessCatalogStore {
  getById(id: string): Promise<AdvertiserProfileData | null>;
  listCandidates(input: {
    normalizedNamePrefix?: string;
    activityArea?: ActivityArea;
    after?: BusinessCatalogPosition;
    limit: number;
  }): Promise<BusinessCatalogCandidatePage>;
}

export interface ActiveActivityAreas {
  isActive(area: ActivityArea): Promise<boolean>;
}

export class BusinessCatalogCursorError extends TypeError {
  constructor() {
    super("Cursor de Negócios inválido para esta consulta.");
    this.name = "BusinessCatalogCursorError";
  }
}

export function normalizeBusinessName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ");
}

export function queryKey(input: {
  normalizedNamePrefix?: string;
  activityArea?: ActivityArea;
  categoryId?: string;
}) {
  if (input.normalizedNamePrefix) return `name:${input.normalizedNamePrefix}`;
  if (input.activityArea) {
    return `area:${input.activityArea.categoryId}:${input.activityArea.subcategoryId}`;
  }
  if (input.categoryId) return `category:${input.categoryId}`;
  return "all";
}

export function encodeCursor(query: string, position: BusinessCatalogPosition): string {
  return Buffer.from(JSON.stringify({ query, ...position }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string, query: string): BusinessCatalogPosition {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      query?: unknown;
      normalizedTitle?: unknown;
      id?: unknown;
    };
    if (
      decoded.query !== query
      || typeof decoded.normalizedTitle !== "string"
      || typeof decoded.id !== "string"
      || !decoded.id
    ) throw new BusinessCatalogCursorError();
    return { normalizedTitle: decoded.normalizedTitle, id: decoded.id };
  }
  catch (error) {
    if (error instanceof BusinessCatalogCursorError) throw error;
    throw new BusinessCatalogCursorError();
  }
}

function hasCoherentPublicIdentity(profile: AdvertiserProfileData) {
  return isOwnedAdvertiserProfile(profile) || isClaimableAdvertiserProfile(profile);
}

export function isPublicCatalogCandidate(profile: AdvertiserProfileData) {
  return hasCoherentPublicIdentity(profile)
    && profile.title.trim().length > 0
    && (profile.contacts?.length ?? 0) > 0;
}

async function activeAreas(
  profile: AdvertiserProfileData,
  catalog: ActiveActivityAreas,
): Promise<ActivityArea[]> {
  const active: ActivityArea[] = [];
  for (const area of profile.activityAreas ?? []) {
    if (await catalog.isActive(area)) active.push(area);
  }
  return active;
}

export async function toBusiness(
  profile: AdvertiserProfileData,
  catalog: ActiveActivityAreas,
): Promise<BusinessPublicData | null> {
  if (!isPublicCatalogCandidate(profile)) return null;
  return (await assessBusiness(profile, catalog)).business;
}

function profileGaps(profile: AdvertiserProfileData): BusinessReadinessGap[] {
  const missing: BusinessReadinessGap[] = [];
  if (!hasCoherentPublicIdentity(profile)) missing.push("identity");
  if (!profile.title.trim()) missing.push("name");
  if (!profile.contacts?.length) missing.push("contact");
  return missing;
}

function publicBusiness(
  profile: AdvertiserProfileData,
  activityAreas: ActivityArea[],
): BusinessPublicData {
  return {
    id: profile.id,
    title: profile.title,
    ...(profile.description ? { description: profile.description } : {}),
    ...(profile.photoURL ? { photoURL: profile.photoURL } : {}),
    ...(profile.contacts ? { contacts: profile.contacts } : {}),
    activityAreas,
    ...(isClaimableAdvertiserProfile(profile) ? { isClaimable: true as const } : {}),
  };
}

export async function assessBusiness(
  profile: AdvertiserProfileData,
  catalog: ActiveActivityAreas,
): Promise<BusinessReadiness> {
  const missing = profileGaps(profile);
  const activityAreas = await activeAreas(profile, catalog);
  if (activityAreas.length === 0) missing.push("activityArea");
  if (missing.length > 0) return { business: null, missing };
  return { business: publicBusiness(profile, activityAreas), missing };
}
