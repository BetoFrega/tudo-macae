"use server";

import { revalidatePath, updateTag } from "next/cache";
import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  getAdvertiserProfileUseCase,
  updateAdvertiserProfileUseCase,
  updateAdvertiserProfileAdministrationUseCase,
} from "@/packages/classifieds-api";
import {
  isClaimableAdvertiserProfile,
  isOwnedAdvertiserProfile,
} from "@tudomacae/advertiser-identity/model";
import { advertiserProfileFieldsFromFormData, formDataText } from "@tudomacae/advertiser-identity/formData";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

type AdvertiserProfileFields = ReturnType<typeof advertiserProfileFieldsFromFormData>;
type AdvertiserProfile = NonNullable<Awaited<ReturnType<typeof getAdvertiserProfileUseCase>>>;

async function updateClaimableProfile(
  profileId: string,
  formData: FormData,
  fields: AdvertiserProfileFields,
  actorId: string,
) {
  const result = await updateAdvertiserProfileAdministrationUseCase({
    id: profileId,
    expectedRevision: Number(formDataText(formData, "expectedRevision")),
    idempotencyKey: formDataText(formData, "idempotencyKey", crypto.randomUUID()),
    actorId,
    channel: "administration",
    patch: fields,
    ...(formData.get("verifySource") === "true"
      ? { verifySource: { url: formDataText(formData, "sourceUrl") } }
      : {}),
  });
  invalidateActivityAreaAdvertisers([
    ...result.effects.previousActivityAreas,
    ...result.effects.activityAreas,
  ]);
  return result.revision;
}

async function updateOwnedProfile(
  profileId: string,
  formData: FormData,
  fields: AdvertiserProfileFields,
  previousProfile: AdvertiserProfile,
) {
  if (!isOwnedAdvertiserProfile(previousProfile)) {
    throw new Error("Perfil de anunciante inválido.");
  }
  await updateAdvertiserProfileUseCase({
    id: profileId,
    ...(formData.has("expectedRevision")
      ? { expectedRevision: Number(formData.get("expectedRevision")) }
      : {}),
    ...fields,
  });
  invalidateActivityAreaAdvertisers([
    ...(previousProfile.activityAreas ?? []),
    ...(fields.activityAreas ?? []),
  ]);
  return (previousProfile.revision ?? 1) + 1;
}

export async function adminUpdateAdvertiserProfile(
  profileId: string,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  const fields = advertiserProfileFieldsFromFormData(formData);

  if (!fields.title) {
    throw new Error("Title is required");
  }

  let resultingRevision: number;
  try {
    const previousProfile = await getAdvertiserProfileUseCase({ id: profileId });
    if (!previousProfile) throw new Error("Perfil de anunciante não encontrado.");
    if (isClaimableAdvertiserProfile(previousProfile)) {
      const revision = await updateClaimableProfile(profileId, formData, fields, user.uid);
      revalidatePath("/admin/perfis");
      updateTag(`advertiser-profile-${profileId}`);
      return { success: true as const, revision };
    }
    resultingRevision = await updateOwnedProfile(profileId, formData, fields, previousProfile);
  }
  catch (error) {
    console.error("Error updating advertiser profile:", error);
    throw new Error("Failed to update advertiser profile");
  }

  revalidatePath("/admin/perfis");
  updateTag(`advertiser-profile-${profileId}`);
  return { success: true as const, revision: resultingRevision };
}
