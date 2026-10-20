"use server";

import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { AdvertiserProfileAccessError, verifyAdvertiserProfileOwnershipUseCase } from "@/packages/classifieds-api";

export async function getAdvertiserProfile(
  profileId: string,
): Promise<AdvertiserProfileData | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  try {
    return await verifyAdvertiserProfileOwnershipUseCase({ id: profileId, userId: user.uid });
  }
  catch (error) {
    if (error instanceof AdvertiserProfileAccessError) return null;
    throw error;
  }
}
