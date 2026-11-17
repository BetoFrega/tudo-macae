import { readFlagshipFlag } from "@/integrations/release-control/flagshipFlag";
import { createReleaseVisibility } from "./releaseVisibility";

const businessClaimFlagKey = "business-claim";

/** Exposes the owner's claim of a claimable Business. The flag lives in Cloudflare Flagship (app `tudo-macae`); off, unavailable or unknown keeps it hidden. */
export const businessClaimVisible = createReleaseVisibility({
  flagKey: businessClaimFlagKey,
  event: "business_claim_visibility_flag",
  context: "business-claim-entry",
  read: readFlagshipFlag,
});
