import { createReleaseVisibility } from "./releaseVisibility";

export const businessClaimFlagKey = "business-claim";

/** Exposes the owner's entry to claim a claimable Business; off, unavailable or malformed keeps it hidden. */
export const businessClaimVisible = createReleaseVisibility({
  flagKey: businessClaimFlagKey,
  event: "business_claim_visibility_flag",
  context: "business-claim-entry",
});
