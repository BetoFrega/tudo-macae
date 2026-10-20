"use server";

import {
  assertEmailAllowsPublication,
  PublicationRequirementError,
} from "@tudomacae/ads/publicationEligibility";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adListingTags } from "@tudomacae/ads";
import type { AdStatus } from "@tudomacae/ads/types";
import {
  activationIssueFromError,
  type AdActivationIssue,
} from "../activationRecovery";
import { updateAdUseCase } from "../../../integrations/ads/use-cases/updateAdUseCase";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";

type UpdateAdResult
  = | { success: true; slug: string }
    | { success: false; error: string }
    | AdActivationIssue;

type OwnedAd = Awaited<ReturnType<typeof verifyAdOwnershipUseCase>>;

const technicalMessage = "Não foi possível atualizar o anúncio. Tente novamente.";

export async function updateAd(
  adId: string,
  formData: FormData,
): Promise<UpdateAdResult> {
  let advertiserProfileId: string | undefined;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "Entre na sua conta para atualizar o anúncio.",
      };
    }

    const categoryId = formData.get("categoryId") as string;
    const subcategoryId = formData.get("subcategoryId") as string;
    const title = formData.get("title") as string;
    const text = formData.get("text") as string;
    advertiserProfileId = formData.get("advertiserProfileId") as string;
    const status = formData.get("status") as AdStatus | null;

    if ([categoryId, subcategoryId, title, text, advertiserProfileId].some(value => !value)) {
      return {
        success: false,
        error: "Preencha os campos obrigatórios do anúncio.",
      };
    }

    const ad = await verifyAdOwnershipUseCase({
      id: adId,
      userId: user.uid,
      isAdmin: user.isAdmin,
    });
    const emailIssue = emailRequirementIssue(user.emailVerified, ad, status, adId, advertiserProfileId);
    if (emailIssue) return emailIssue;
    const imagesStr = formData.get("images") as string;
    const images = imagesStr ? JSON.parse(imagesStr) : undefined;
    const observedImageIds = JSON.parse(String(formData.get("observedImageIds") ?? "[]"));

    const result = await updateAdUseCase({
      id: adId,
      categoryId,
      subcategoryId,
      title,
      text,
      advertiserProfileId,
      ...(status && { status }),
      ...(images && { images }),
      observedImageIds,
    });

    invalidateUpdatedAd(adId, result.slug, ad, { advertiserProfileId, categoryId, subcategoryId });
    return { success: true, slug: result.slug };
  }
  catch (error) {
    return updateFailure(error, adId, advertiserProfileId);
  }
}

function updateFailure(error: unknown, adId: string, advertiserProfileId: string | undefined) {
  if (!(error instanceof PublicationRequirementError)) {
    console.error("Error updating ad:", error);
  }
  return activationIssueFromError(error, {
    adId,
    advertiserProfileId,
    technicalMessage,
  });
}

// Returns the activation issue when the email requirement blocks the requested status; other failures propagate.
function emailRequirementIssue(emailVerified: boolean, ad: OwnedAd, status: AdStatus | null, adId: string, advertiserProfileId: string) {
  try {
    assertEmailAllowsPublication(emailVerified, ad.status, status ?? undefined);
    return null;
  }
  catch (error) {
    if (error instanceof PublicationRequirementError && error.requirement === "email") {
      return activationIssueFromError(error, { adId, advertiserProfileId, technicalMessage });
    }
    throw error;
  }
}

function invalidateUpdatedAd(adId: string, slug: string, ad: OwnedAd, next: { advertiserProfileId: string; categoryId: string; subcategoryId: string }) {
  revalidatePath("/");
  revalidatePath(`/anuncio/${adId}`);
  revalidatePath(`/anuncio/${adId}/${slug}`);
  updateTag(`ad-${adId}`);
  updateTag(`ads-by-profile-${ad.advertiserProfileId}`);
  updateTag(`ads-by-profile-${next.advertiserProfileId}`);
  for (const tag of adListingTags(
    ad,
    { categoryId: next.categoryId, subcategoryId: next.subcategoryId },
  )) {
    updateTag(tag);
  }
}
