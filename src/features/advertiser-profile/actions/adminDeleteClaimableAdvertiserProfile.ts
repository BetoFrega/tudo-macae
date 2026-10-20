"use server";

import { revalidatePath, updateTag } from "next/cache";
import { forbidden, unauthorized } from "next/navigation";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import {
  deleteAdvertiserProfileAdministrationUseCase,
} from "@/packages/classifieds-api";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

export async function adminDeleteClaimableAdvertiserProfile(
  profileId: string,
  expectedRevision: number,
  idempotencyKey: string,
) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!user.isAdmin) return forbidden();

  let result;
  try {
    result = await deleteAdvertiserProfileAdministrationUseCase({
      id: profileId,
      expectedRevision,
      idempotencyKey,
      actorId: user.uid,
      channel: "administration",
    });
  }
  catch (error) {
    throw error;
  }
  invalidateActivityAreaAdvertisers(result.effects.previousActivityAreas);
  revalidatePath("/admin/perfis");
  updateTag(`advertiser-profile-${profileId}`);
  return { success: true as const };
}
