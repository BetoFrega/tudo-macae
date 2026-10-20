"use server";

import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { getAllAdvertiserProfilesUseCase } from "@/packages/classifieds-api";

export async function getAllAdvertiserProfiles(): Promise<AdvertiserProfileData[]> {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  try {
    return await getAllAdvertiserProfilesUseCase();
  }
  catch (error) {
    console.error("Error fetching all advertiser profiles:", error);
    return [];
  }
}
