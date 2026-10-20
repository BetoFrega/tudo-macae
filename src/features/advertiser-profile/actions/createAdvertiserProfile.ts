"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { AdvertiserIdentityTypeConflict, AdvertiserProfileCreationPayloadConflict, createAdvertiserProfileUseCase, verifyAdvertiserProfileOwnershipUseCase } from "@/packages/classifieds-api";
import { advertiserProfileFieldsFromFormData, formDataText, identityTypeFromFormData } from "@tudomacae/advertiser-identity/formData";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

function operationIdFrom(formData: FormData) {
  if (!formData.has("operationId")) return undefined;
  const operationId = formDataText(formData, "operationId");
  if (operationId && !/^[0-9a-f-]{36}$/iu.test(operationId)) throw new Error("Invalid operation ID");
  return operationId;
}

function identityTypeFrom(formData: FormData) {
  const identityType = identityTypeFromFormData(formData);
  if (!identityType) throw new Error("Identity type is required");
  return identityType;
}

export async function createAdvertiserProfile(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const fields = advertiserProfileFieldsFromFormData(formData);
  const operationId = operationIdFrom(formData);
  const identityType = identityTypeFrom(formData);
  const activityAreas = fields.activityAreas ?? [];

  if (!fields.title) {
    throw new Error("Title is required");
  }

  try {
    const profileId = await createAdvertiserProfileUseCase({
      userId: user.uid,
      ...(operationId ? { operationId } : {}),
      ...(identityType ? { identityType } : {}),
      ...fields,
      contacts: fields.contacts ?? [],
      activityAreas,
    });
    const profile = await verifyAdvertiserProfileOwnershipUseCase({ id: profileId, userId: user.uid });

    invalidateActivityAreaAdvertisers(activityAreas);
    revalidatePath("/minha-conta/perfis");
    return { success: true as const, profileId, revision: profile.revision ?? 1 };
  }
  catch (error) {
    return creationFailure(error);
  }
}

function creationFailure(error: unknown) {
  if (error instanceof AdvertiserProfileCreationPayloadConflict) {
    return { success: false as const, outcome: "already_created" as const, profileId: error.profileId };
  }
  if (error instanceof AdvertiserIdentityTypeConflict) {
    return { success: false as const, outcome: "personal_exists" as const };
  }
  console.error("Error creating advertiser profile:", error);
  throw new Error("Failed to create advertiser profile");
}
