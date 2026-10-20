import type { AdStatus } from "@tudomacae/ads/types";
import {
  profileRequirementMessage,
  PublicationRequirementError,
} from "@tudomacae/ads/publicationEligibility";

export type AdActivationIssueDetails
  = | { reason: "profile"; error: string; adId: string; advertiserProfileId?: string }
    | { reason: "email" | "technical"; error: string; adId: string };

export type AdActivationIssue = { success: false } & AdActivationIssueDetails;

export type UpdateAdStatusResult
  = | { success: true; status: AdStatus }
    | AdActivationIssue;

export function activationIssueFromError(
  error: unknown,
  context: {
    adId: string;
    advertiserProfileId?: string | undefined;
    technicalMessage: string;
  },
): AdActivationIssue {
  if (error instanceof PublicationRequirementError) {
    if (error.requirement === "profile") {
      return {
        success: false,
        reason: "profile",
        error: profileRequirementMessage(error.missing),
        adId: context.adId,
        ...(context.advertiserProfileId
          ? { advertiserProfileId: context.advertiserProfileId }
          : {}),
      };
    }
    return {
      success: false,
      reason: "email",
      error: "Confirme seu e-mail antes de reativar o anúncio.",
      adId: context.adId,
    };
  }
  return {
    success: false,
    reason: "technical",
    error: context.technicalMessage,
    adId: context.adId,
  };
}
