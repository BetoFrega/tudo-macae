import type { z } from "zod";
import { isClaimableAdvertiserProfile, isOwnedAdvertiserProfile, type ActivityArea, type AdvertiserProfileData } from "../model";
import { normalizeBusinessName } from "../business";
import type { updateAdvertiserProfileAdministrationInputSchema } from "./administrationSchemas";

export function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export type AdvertiserProfileState = "claimable" | "owned";
export type AdvertiserProfilePage<T> = { items: T[]; nextCursor?: string };
export interface AdvertiserProfileSummary {
  id: string;
  state: AdvertiserProfileState;
  title: string;
  activityAreas: ActivityArea[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface AdvertiserProfileDuplicateSummary {
  id: string;
  state: AdvertiserProfileState;
  title: string;
  matchReasons: Array<"normalizedName" | "contact">;
}
export interface AdvertiserProfileMutationEffects {
  previousActivityAreas: ActivityArea[];
  activityAreas: ActivityArea[];
}
export interface AdvertiserProfileMutationResult {
  outcome: "created" | "updated" | "unchanged" | "deleted";
  replayed: boolean;
  profileId: string;
  revision: number;
  effects: AdvertiserProfileMutationEffects;
  profile?: AdvertiserProfileSummary;
  photoCleanup?: { status: "not_required" } | { status: "scheduled"; operationId: string };
}

export function advertiserProfileAdministrationState(profile: AdvertiserProfileData): AdvertiserProfileState | null {
  if (isClaimableAdvertiserProfile(profile)) return "claimable";
  if (isOwnedAdvertiserProfile(profile)) return "owned";
  return null;
}

export function summarizeAdvertiserProfile(profile: AdvertiserProfileData): AdvertiserProfileSummary {
  const state = advertiserProfileAdministrationState(profile);
  if (!state) throw new TypeError("Perfil de anunciante com estado incoerente.");
  return {
    id: profile.id,
    state,
    title: profile.title,
    activityAreas: profile.activityAreas ?? [],
    revision: profile.revision ?? 1,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function matchAdvertiserProfileDuplicate(
  profile: AdvertiserProfileData,
  normalizedTitle: string,
  normalizedContacts: ReadonlySet<string>,
): AdvertiserProfileDuplicateSummary | null {
  const state = advertiserProfileAdministrationState(profile);
  if (!state) return null;
  const matchReasons: AdvertiserProfileDuplicateSummary["matchReasons"] = [];
  if (normalizeBusinessName(profile.title) === normalizedTitle) matchReasons.push("normalizedName");
  if (profile.contacts?.some(item => normalizedContacts.has(item.number.replace(/\D/g, "")))) matchReasons.push("contact");
  return matchReasons.length ? { id: profile.id, state, title: profile.title, matchReasons } : null;
}

type AdministrationUpdateInput = z.output<typeof updateAdvertiserProfileAdministrationInputSchema>;

function patchedAdvertiserProfile(current: AdvertiserProfileData, input: AdministrationUpdateInput, now: number): AdvertiserProfileData {
  const patch: Partial<NonNullable<AdministrationUpdateInput["patch"]>> = input.patch ?? {};
  return {
    ...current,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    contacts: patch.contacts ?? current.contacts ?? [],
    activityAreas: patch.activityAreas ?? current.activityAreas ?? [],
    ...(input.verifySource ? { source: { url: input.verifySource.url, checkedAt: now } } : {}),
  };
}

function comparableAdvertiserProfile(profile: AdvertiserProfileData) {
  return {
    title: profile.title,
    description: profile.description,
    contacts: profile.contacts ?? [],
    activityAreas: profile.activityAreas ?? [],
    source: profile.source,
  };
}

export function applyAdvertiserProfileAdministrationUpdate(
  current: AdvertiserProfileData,
  input: AdministrationUpdateInput,
  now: number,
) {
  const next = patchedAdvertiserProfile(current, input, now);
  const changed = stableValue(comparableAdvertiserProfile(current)) !== stableValue(comparableAdvertiserProfile(next));
  const currentRevision = current.revision ?? 1;
  return {
    next,
    changed,
    revision: changed ? currentRevision + 1 : currentRevision,
    effects: { previousActivityAreas: current.activityAreas ?? [], activityAreas: next.activityAreas ?? [] },
  };
}
