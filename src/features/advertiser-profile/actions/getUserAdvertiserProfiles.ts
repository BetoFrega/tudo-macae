"use server";

import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { getUserAdvertiserProfilesUseCase } from "@/packages/classifieds-api";

export async function getUserAdvertiserProfiles(): Promise<
  AdvertiserProfileData[]
> {
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }

  try {
    return await getUserAdvertiserProfilesUseCase(user.uid);
  }
  catch (error) {
    console.error("Error fetching/creating advertiser profiles:", error);
    return [];
  }
}
