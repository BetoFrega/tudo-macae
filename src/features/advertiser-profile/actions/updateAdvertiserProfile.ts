"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { AdvertiserProfileRevisionConflict, updateAdvertiserProfileUseCase } from "@/packages/classifieds-api";
import { verifyAdvertiserProfileOwnershipUseCase } from "@/packages/classifieds-api";
import { advertiserProfileFieldsFromFormData, formDataText } from "@tudomacae/advertiser-identity/formData";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

export async function updateAdvertiserProfile(
  profileId: string,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const fields = advertiserProfileFieldsFromFormData(formData);

  if (!fields.title) {
    throw new Error("Title is required");
  }

  let resultingRevision = 1;
  try {
    // Verify ownership (will throw if not authorized)
    const profile = await verifyAdvertiserProfileOwnershipUseCase({
      id: profileId,
      userId: user.uid,
    });

    await updateAdvertiserProfileUseCase({
      id: profileId,
      ...(formData.has("expectedRevision")
        ? { expectedRevision: Number(formDataText(formData, "expectedRevision")) }
        : {}),
      ...fields,
    });
    resultingRevision = (profile.revision ?? 1) + 1;
    invalidateActivityAreaAdvertisers([
      ...(profile.activityAreas ?? []),
      ...(fields.activityAreas ?? []),
    ]);
  }
  catch (error) {
    return updateFailure(error);
  }

  revalidatePath("/minha-conta/perfis");
  updateTag(`advertiser-profile-${profileId}`);
  return { success: true as const, revision: resultingRevision };
}

function updateFailure(error: unknown) {
  if (error instanceof AdvertiserProfileRevisionConflict) {
    return { success: false as const, outcome: "conflict" as const, currentRevision: error.currentRevision };
  }
  console.error("Error updating advertiser profile:", error);
  throw new Error("Failed to update advertiser profile");
}
