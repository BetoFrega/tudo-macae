import { createReleaseVisibility } from "./releaseVisibility";

export const registrationVisibilityFlagKey = "business-registration-visibility";

export const registrationVisible = createReleaseVisibility({
  flagKey: registrationVisibilityFlagKey,
  event: "business_registration_visibility_flag",
  context: "shared-registration-navigation",
});
