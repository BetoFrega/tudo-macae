"use server";

import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { AdData } from "@tudomacae/ads/types";
import { listAllAdsUseCase } from "../../../integrations/ads/use-cases/listAllAdsUseCase";

/**
 * Server action to list all ads for admin users.
 * Returns all ads including paused ones.
 */
export async function listAllAds(): Promise<AdData[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  if (!currentUser.isAdmin) return forbidden();

  return await listAllAdsUseCase();
}
