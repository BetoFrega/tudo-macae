"use server";

import {
  assertEmailAllowsPublication,
  PublicationRequirementError,
} from "@tudomacae/ads/publicationEligibility";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adListingTags } from "@tudomacae/ads";
import { setAdStatus } from "@/integrations/ads/mutation";
import type { AdStatus } from "@tudomacae/ads/types";
import {
  activationIssueFromError,
  type UpdateAdStatusResult,
} from "../activationRecovery";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";

export async function updateAdStatus(adId: string, status: AdStatus): Promise<UpdateAdStatusResult> {
  // Verify user is authenticated
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      "Unauthorized: User must be logged in to update an ad status",
    );
  }

  // Verify ownership (will throw if not authorized)
  const verifiedAd = await verifyAdOwnershipUseCase({
    id: adId,
    userId: user.uid,
    isAdmin: user.isAdmin,
  });
  const advertiserProfileId = verifiedAd.advertiserProfileId;

  try {
    assertEmailAllowsPublication(user.emailVerified, verifiedAd.status, status);

    await setAdStatus({
      id: adId,
      status,
    });
  }
  catch (error) {
    if (!(error instanceof PublicationRequirementError)) {
      console.error("Error updating ad status:", error);
    }
    return activationIssueFromError(error, {
      adId,
      advertiserProfileId,
      technicalMessage: "Não foi possível atualizar o anúncio. Tente novamente.",
    });
  }

  try {
    revalidatePath("/");
    revalidatePath("/minha-conta/anuncios");
    revalidatePath(`/anuncio/${adId}`);
    updateTag(`ad-${adId}`);
    if (advertiserProfileId)
      updateTag(`ads-by-profile-${advertiserProfileId}`);
    for (const tag of adListingTags(verifiedAd)) {
      updateTag(tag);
    }
  }
  catch (error) {
    console.error("Error refreshing Ad listings:", error);
    return activationIssueFromError(error, {
      adId,
      technicalMessage: "O anúncio foi atualizado, mas não foi possível confirmar as listagens. Tente novamente.",
    });
  }
  return { success: true, status };
}
