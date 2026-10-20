import type { z } from "zod";
import type { AdvertiserProfileData } from "../model";
import type {
  createAdvertiserProfileAdministrationInputSchema,
  deleteAdvertiserProfileAdministrationInputSchema,
  updateAdvertiserProfileAdministrationInputSchema,
} from "./administrationSchemas";
import {
  advertiserProfileAdministrationState,
  applyAdvertiserProfileAdministrationUpdate,
  stableValue,
  summarizeAdvertiserProfile,
  type AdvertiserProfileDuplicateSummary,
  type AdvertiserProfileMutationResult,
} from "./administrationProfiles";
import {
  AdvertiserProfileAdministrationError,
  type CreateAdvertiserProfileAdministrationFacts,
  type CreateAdvertiserProfileAdministrationPlan,
  type DeleteAdvertiserProfileAdministrationFacts,
  type DeleteAdvertiserProfileAdministrationPlan,
  type ReadFailure,
  type StoreFailure,
  type UpdateAdvertiserProfileAdministrationFacts,
  type UpdateAdvertiserProfileAdministrationPlan,
} from "./administrationStore";

export function unwrap(result: AdvertiserProfileMutationResult | StoreFailure): AdvertiserProfileMutationResult {
  if ("outcome" in result) return result;
  return throwAdministrationError(result);
}

export function throwAdministrationError(result: StoreFailure): never {
  const messages: Record<StoreFailure["status"], string> = {
    notFound: "Perfil de anunciante não encontrado.",
    stateMismatch: "O Perfil de anunciante não está no estado esperado.",
    invalidProfileState: "O Perfil de anunciante possui estado incoerente.",
    hasAds: "O Perfil de anunciante possui Anúncios associados.",
    imageCleanupBlocked: "Aguarde os envios de fotos antes de excluir o perfil.",
    revisionConflict: "O Perfil de anunciante mudou antes da operação.",
    possibleDuplicate: "Foram encontrados possíveis Perfis de anunciante duplicados.",
    duplicateConfirmationChanged: "As evidências de duplicidade mudaram antes da criação.",
    idempotencyConflict: "A chave de idempotência já identifica outra operação.",
  };
  const details = "currentRevision" in result
    ? { currentRevision: result.currentRevision }
    : "candidates" in result
      ? { candidates: result.candidates, confirmationToken: result.confirmationToken }
      : {};
  throw new AdvertiserProfileAdministrationError(result.status, messages[result.status], details);
}

export function unwrapGet(result: AdvertiserProfileData | ReadFailure): AdvertiserProfileData {
  if (!("status" in result)) return result;
  return throwAdministrationError(result);
}

function assertActiveActivityAreas(activityAreas: boolean[]) {
  if (activityAreas.some(active => !active)) {
    throw new Error("Categoria ou subcategoria inválida ou inativa");
  }
}

export function createPlan(
  input: z.output<typeof createAdvertiserProfileAdministrationInputSchema> & { state: "claimable" },
  facts: CreateAdvertiserProfileAdministrationFacts,
  now: number,
  digestConfirmationEvidence: (evidence: string) => string,
): CreateAdvertiserProfileAdministrationPlan {
  const confirmationToken = createDuplicateConfirmationToken(
    input,
    facts.duplicates,
    digestConfirmationEvidence,
  );
  if (input.duplicateConfirmationToken && input.duplicateConfirmationToken !== confirmationToken) {
    return { status: "duplicateConfirmationChanged", candidates: facts.duplicates, confirmationToken };
  }
  if (facts.duplicates.length && !input.duplicateConfirmationToken) {
    return { status: "possibleDuplicate", candidates: facts.duplicates, confirmationToken };
  }
  assertActiveActivityAreas(facts.activityAreas);
  const record: AdvertiserProfileData = {
    id: facts.profileId,
    claimable: true,
    source: { url: input.sourceUrl, checkedAt: now },
    title: input.title.trim(),
    description: input.description,
    contacts: input.contacts,
    activityAreas: input.activityAreas,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  return {
    kind: "create",
    record,
    result: {
      outcome: "created",
      replayed: false,
      profileId: record.id,
      revision: 1,
      effects: { previousActivityAreas: [], activityAreas: record.activityAreas ?? [] },
      profile: summarizeAdvertiserProfile(record),
    },
  };
}

function createDuplicateConfirmationToken(
  input: z.output<typeof createAdvertiserProfileAdministrationInputSchema>,
  candidates: AdvertiserProfileDuplicateSummary[],
  digest: (evidence: string) => string,
): string {
  const intent = {
    state: "claimable" as const,
    title: input.title.trim(),
    description: input.description,
    contacts: input.contacts,
    activityAreas: input.activityAreas,
    sourceUrl: input.sourceUrl,
  };
  return digest(stableValue({ intent, candidates }));
}

type ProfilePreconditionFailure
  = | { status: "notFound" }
    | { status: "invalidProfileState" }
    | { status: "stateMismatch" }
    | { status: "revisionConflict"; currentRevision: number };

function checkProfilePreconditions(
  profile: AdvertiserProfileData | null | undefined,
  input: { expectedState: "claimable"; expectedRevision: number },
): { failure: ProfilePreconditionFailure } | { profile: AdvertiserProfileData; currentRevision: number } {
  if (!profile) return { failure: { status: "notFound" } };
  const state = advertiserProfileAdministrationState(profile);
  if (!state) return { failure: { status: "invalidProfileState" } };
  if (state !== input.expectedState) return { failure: { status: "stateMismatch" } };
  const currentRevision = profile.revision ?? 1;
  if (currentRevision !== input.expectedRevision) return { failure: { status: "revisionConflict", currentRevision } };
  return { profile, currentRevision };
}

function updatedFields(
  input: z.output<typeof updateAdvertiserProfileAdministrationInputSchema>,
  revision: number,
  now: number,
): Partial<AdvertiserProfileData> {
  const fields: Partial<AdvertiserProfileData> = { revision, updatedAt: now };
  if (input.patch) Object.assign(fields, input.patch);
  if (input.verifySource) {
    fields.source = { url: input.verifySource.url, checkedAt: now };
  }
  return fields;
}

export function updatePlan(
  input: z.output<typeof updateAdvertiserProfileAdministrationInputSchema> & { expectedState: "claimable" },
  facts: UpdateAdvertiserProfileAdministrationFacts,
  now: number,
): UpdateAdvertiserProfileAdministrationPlan {
  const checked = checkProfilePreconditions(facts.profile, input);
  if ("failure" in checked) return checked.failure;
  const { profile } = checked;
  if (input.patch?.activityAreas) assertActiveActivityAreas(facts.activityAreas);
  const { next, changed, revision, effects } = applyAdvertiserProfileAdministrationUpdate(profile, input, now);
  const result: AdvertiserProfileMutationResult = {
    outcome: changed ? "updated" : "unchanged",
    replayed: false,
    profileId: profile.id,
    revision,
    effects,
    profile: summarizeAdvertiserProfile({ ...next, revision, updatedAt: changed ? now : profile.updatedAt }),
  };
  if (!changed) return { kind: "update", result };
  return {
    kind: "update",
    fields: updatedFields(input, revision, now),
    result,
  };
}

export function deletePlan(
  input: z.output<typeof deleteAdvertiserProfileAdministrationInputSchema> & { expectedState: "claimable" },
  facts: DeleteAdvertiserProfileAdministrationFacts,
  now: number,
): DeleteAdvertiserProfileAdministrationPlan {
  const checked = checkProfilePreconditions(facts.profile, input);
  if ("failure" in checked) return checked.failure;
  const { profile, currentRevision } = checked;
  if (facts.photoReservations?.some(reservation => reservation.expiresAt === undefined || reservation.expiresAt > now)) return { status: "imageCleanupBlocked" };
  if (facts.hasAssociatedAds) return { status: "hasAds" };
  const photoCleanup = profile.photoPath
    ? { status: "scheduled" as const, operationId: facts.photoCleanupOperationId }
    : { status: "not_required" as const };
  return {
    kind: "delete",
    ...(profile.photoPath && photoCleanup.status === "scheduled"
      ? { photoCleanup: { operationId: photoCleanup.operationId, photoPath: profile.photoPath } }
      : {}),
    result: {
      outcome: "deleted",
      replayed: false,
      profileId: profile.id,
      revision: currentRevision + 1,
      effects: { previousActivityAreas: profile.activityAreas ?? [], activityAreas: [] },
      photoCleanup,
    },
  };
}
