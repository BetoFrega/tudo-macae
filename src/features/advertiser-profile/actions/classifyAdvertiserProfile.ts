"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { AdvertiserIdentityTypeConflict, classifyAdvertiserProfileUseCase } from "@/packages/classifieds-api";
import { advertiserIdentityTypeSchema } from "@tudomacae/advertiser-identity/client";
import type { AdvertiserIdentityType } from "@tudomacae/advertiser-identity/model";

export async function classifyAdvertiserProfile(profileId: string, identityType: AdvertiserIdentityType) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const type = advertiserIdentityTypeSchema.parse(identityType);

  try {
    await classifyAdvertiserProfileUseCase({ id: profileId, userId: user.uid, identityType: type });
  }
  catch (error) {
    if (error instanceof AdvertiserIdentityTypeConflict) {
      return { success: false as const, outcome: error.reason === "personal-exists" ? "personal_exists" as const : "already_classified" as const };
    }
    console.error("Error classifying advertiser profile:", error);
    throw new Error("Failed to classify advertiser profile");
  }

  revalidatePath("/minha-conta/perfis");
  updateTag(`advertiser-profile-${profileId}`);
  return { success: true as const };
}
