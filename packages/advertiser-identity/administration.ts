import {
  advertiserProfileAdministrationState,
} from "./lib/administrationProfiles";
import {
  createAdvertiserProfileAdministrationInputSchema,
  deleteAdvertiserProfileAdministrationInputSchema,
  findAdvertiserProfileDuplicatesInputSchema,
  getAdvertiserProfileAdministrationInputSchema,
  listAdvertiserProfilesInputSchema,
  updateAdvertiserProfileAdministrationInputSchema,
} from "./lib/administrationSchemas";
import type { AdvertiserProfileAdministrationStore } from "./lib/administrationStore";
import { createPlan, deletePlan, throwAdministrationError, unwrap, unwrapGet, updatePlan } from "./lib/administrationPlans";

export {
  createAdvertiserProfileAdministrationInputSchema,
  createAdvertiserProfileToolInputSchema,
  deleteAdvertiserProfileAdministrationInputSchema,
  deleteAdvertiserProfileToolInputSchema,
  findAdvertiserProfileDuplicatesInputSchema,
  getAdvertiserProfileAdministrationInputSchema,
  listAdvertiserProfilesInputSchema,
  updateAdvertiserProfileAdministrationInputSchema,
  updateAdvertiserProfileToolInputSchema,
} from "./lib/administrationSchemas";
export {
  advertiserProfileAdministrationState,
  applyAdvertiserProfileAdministrationUpdate,
  matchAdvertiserProfileDuplicate,
  summarizeAdvertiserProfile,
  type AdvertiserProfileDuplicateSummary,
  type AdvertiserProfileMutationEffects,
  type AdvertiserProfileMutationResult,
  type AdvertiserProfilePage,
  type AdvertiserProfileState,
  type AdvertiserProfileSummary,
} from "./lib/administrationProfiles";
export {
  AdvertiserProfileAdministrationError,
  type AdvertiserProfileAdministrationErrorCode,
  type AdvertiserProfileAdministrationStore,
  type CreateAdvertiserProfileAdministrationFacts,
  type CreateAdvertiserProfileAdministrationPlan,
  type DeleteAdvertiserProfileAdministrationFacts,
  type DeleteAdvertiserProfileAdministrationPlan,
  type UpdateAdvertiserProfileAdministrationFacts,
  type UpdateAdvertiserProfileAdministrationPlan,
} from "./lib/administrationStore";

export const advertiserProfileAuditRetentionMs = 365 * 24 * 60 * 60 * 1000;

export function createAdvertiserProfileAdministration(dependencies: {
  store: AdvertiserProfileAdministrationStore;
  now(): number;
  digestConfirmationEvidence(evidence: string): string;
}) {
  return {
    list(input: unknown = {}) {
      const value = listAdvertiserProfilesInputSchema.parse(input);
      return dependencies.store.list({
        state: value.filter?.state ?? "claimable",
        limit: value.limit ?? 20,
        ...(value.cursor ? { cursor: value.cursor } : {}),
      });
    },
    async get(input: unknown) {
      const value = getAdvertiserProfileAdministrationInputSchema.parse(input);
      const profile = unwrapGet(await dependencies.store.get({ id: value.id }));
      const state = advertiserProfileAdministrationState(profile);
      if (!state) return throwAdministrationError({ status: "invalidProfileState" });
      if (state !== (value.expectedState ?? "claimable")) {
        return throwAdministrationError({ status: "stateMismatch" });
      }
      return profile;
    },
    findDuplicates(input: unknown) {
      return dependencies.store.findDuplicates(findAdvertiserProfileDuplicatesInputSchema.parse(input));
    },
    async create(input: unknown) {
      const value = createAdvertiserProfileAdministrationInputSchema.parse(input);
      const operation = { ...value, state: value.state ?? "claimable" };
      const now = dependencies.now();
      return unwrap(await dependencies.store.create(operation, facts => createPlan(
        operation,
        facts,
        now,
        dependencies.digestConfirmationEvidence,
      )));
    },
    async update(input: unknown) {
      const value = updateAdvertiserProfileAdministrationInputSchema.parse(input);
      const operation = { ...value, expectedState: value.expectedState ?? "claimable" };
      const now = dependencies.now();
      return unwrap(await dependencies.store.update(operation, facts => updatePlan(operation, facts, now)));
    },
    async delete(input: unknown) {
      const value = deleteAdvertiserProfileAdministrationInputSchema.parse(input);
      const operation = { ...value, expectedState: value.expectedState ?? "claimable" };
      const now = dependencies.now();
      return unwrap(await dependencies.store.delete(operation, facts => deletePlan(operation, facts, now)));
    },
  };
}
