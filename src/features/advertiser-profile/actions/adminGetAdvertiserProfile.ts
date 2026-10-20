"use server";

import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { getAdvertiserProfileUseCase } from "@/packages/classifieds-api";

export async function adminGetAdvertiserProfile(
  profileId: string,
): Promise<AdvertiserProfileData | null> {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  try {
    return await getAdvertiserProfileUseCase({ id: profileId });
  }
  catch (error) {
    console.error("Error fetching advertiser profile:", error);
    return null;
  }
}
