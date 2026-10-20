"use server";

import { revalidatePath } from "next/cache";
import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  AdvertiserProfileAdministrationError,
  createAdvertiserProfileAdministrationUseCase,
} from "@/packages/classifieds-api";
import { advertiserProfileFieldsFromFormData, formDataText } from "@tudomacae/advertiser-identity/formData";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

export async function adminCreateClaimableAdvertiserProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const fields = advertiserProfileFieldsFromFormData(formData);

  try {
    const result = await createAdvertiserProfileAdministrationUseCase({
      ...fields,
      sourceUrl: formDataText(formData, "sourceUrl"),
      idempotencyKey: formDataText(formData, "idempotencyKey", crypto.randomUUID()),
      actorId: user.uid,
      channel: "administration",
      ...(typeof formData.get("duplicateConfirmationToken") === "string"
        ? { duplicateConfirmationToken: formDataText(formData, "duplicateConfirmationToken") }
        : {}),
    });
    invalidateActivityAreaAdvertisers(result.effects.activityAreas);
    revalidatePath("/admin/perfis");
    return { success: true as const, profileId: result.profileId, revision: result.revision };
  }
  catch (error) {
    if (error instanceof AdvertiserProfileAdministrationError
      && (error.code === "possibleDuplicate" || error.code === "duplicateConfirmationChanged")) {
      return {
        success: false as const,
        duplicates: error.details.candidates as { id: string; title: string }[],
        confirmationToken: String(error.details.confirmationToken),
      };
    }
    throw error;
  }
}
