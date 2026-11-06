import type { BusinessClaimFieldErrors } from "@tudomacae/advertiser-identity/businessClaim";

export type BusinessClaimFormState
  = | { status: "idle" }
    | { status: "submitted" }
    | { status: "error"; message: string; fieldErrors: BusinessClaimFieldErrors };

export type BusinessClaimReviewState
  = | { status: "idle" }
    | { status: "reviewed"; outcome: "approved" | "rejected" }
    | { status: "error"; message: string; fieldErrors: BusinessClaimFieldErrors };
