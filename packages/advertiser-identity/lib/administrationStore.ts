import type { z } from "zod";
import type { AdvertiserProfileData } from "../model";
import type {
  createAdvertiserProfileAdministrationInputSchema,
  deleteAdvertiserProfileAdministrationInputSchema,
  findAdvertiserProfileDuplicatesInputSchema,
  updateAdvertiserProfileAdministrationInputSchema,
} from "./administrationSchemas";
import type {
  AdvertiserProfileDuplicateSummary,
  AdvertiserProfileMutationResult,
  AdvertiserProfilePage,
  AdvertiserProfileSummary,
} from "./administrationProfiles";

export type StoreFailure
  = | { status: "notFound" | "stateMismatch" | "invalidProfileState" | "hasAds" | "idempotencyConflict" | "imageCleanupBlocked" }
    | { status: "revisionConflict"; currentRevision: number }
    | { status: "possibleDuplicate" | "duplicateConfirmationChanged"; candidates: AdvertiserProfileDuplicateSummary[]; confirmationToken: string };

export type ReadFailure = { status: "notFound" };

export interface CreateAdvertiserProfileAdministrationFacts {
  profileId: string;
  duplicates: AdvertiserProfileDuplicateSummary[];
  activityAreas: boolean[];
}

export interface UpdateAdvertiserProfileAdministrationFacts {
  profile: AdvertiserProfileData | null;
  activityAreas: boolean[];
}

export interface DeleteAdvertiserProfileAdministrationFacts {
  profile: AdvertiserProfileData | null;
  hasAssociatedAds: boolean;
  photoCleanupOperationId: string;
  photoReservations?: readonly { expiresAt?: number | undefined }[];
}

export type CreateAdvertiserProfileAdministrationPlan = StoreFailure | {
  kind: "create";
  record: AdvertiserProfileData;
  result: AdvertiserProfileMutationResult;
};

export type UpdateAdvertiserProfileAdministrationPlan = StoreFailure | {
  kind: "update";
  fields?: Partial<AdvertiserProfileData>;
  result: AdvertiserProfileMutationResult;
};

export type DeleteAdvertiserProfileAdministrationPlan = StoreFailure | {
  kind: "delete";
  photoCleanup?: { operationId: string; photoPath: string };
  result: AdvertiserProfileMutationResult;
};

export interface AdvertiserProfileAdministrationStore {
  list(input: { state: "claimable"; limit: number; cursor?: string }): Promise<AdvertiserProfilePage<AdvertiserProfileSummary>>;
  get(input: { id: string }): Promise<AdvertiserProfileData | ReadFailure>;
  findDuplicates(input: z.output<typeof findAdvertiserProfileDuplicatesInputSchema>): Promise<AdvertiserProfilePage<AdvertiserProfileDuplicateSummary>>;
  create(
    input: z.output<typeof createAdvertiserProfileAdministrationInputSchema> & { state: "claimable" },
    decide: (facts: CreateAdvertiserProfileAdministrationFacts) => CreateAdvertiserProfileAdministrationPlan,
  ): Promise<AdvertiserProfileMutationResult | StoreFailure>;
  update(
    input: z.output<typeof updateAdvertiserProfileAdministrationInputSchema> & { expectedState: "claimable" },
    decide: (facts: UpdateAdvertiserProfileAdministrationFacts) => UpdateAdvertiserProfileAdministrationPlan,
  ): Promise<AdvertiserProfileMutationResult | StoreFailure>;
  delete(
    input: z.output<typeof deleteAdvertiserProfileAdministrationInputSchema> & { expectedState: "claimable" },
    decide: (facts: DeleteAdvertiserProfileAdministrationFacts) => DeleteAdvertiserProfileAdministrationPlan,
  ): Promise<AdvertiserProfileMutationResult | StoreFailure>;
}

export type AdvertiserProfileAdministrationErrorCode
  = | "notFound" | "stateMismatch" | "invalidProfileState" | "hasAds"
    | "revisionConflict" | "possibleDuplicate" | "duplicateConfirmationChanged"
    | "idempotencyConflict" | "imageCleanupBlocked";

export class AdvertiserProfileAdministrationError extends Error {
  constructor(
    public readonly code: AdvertiserProfileAdministrationErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AdvertiserProfileAdministrationError";
  }
}
