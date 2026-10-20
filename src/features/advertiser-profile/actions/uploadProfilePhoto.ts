"use server";

import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { uploadAdvertiserProfilePhoto } from "@/integrations/advertiser-identity/upload";
import { getAdvertiserProfileUseCase } from "@/packages/classifieds-api";
import type { UploadProfilePhotoResult } from "@tudomacae/advertiser-identity/photo";
import { invalidateActivityAreaAdvertisers } from "./invalidateActivityAreaAdvertisers";

export async function uploadProfilePhoto(profileId: string, expectedRevision: number, formData: FormData): Promise<UploadProfilePhotoResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Entre na sua conta para enviar uma foto ao perfil." };
    const profile = await getAdvertiserProfileUseCase({ id: profileId });
    const result = await uploadAdvertiserProfilePhoto({ profileId, userId: user.uid, isAdmin: user.isAdmin, expectedRevision, file: formData.get("photo") as File | null, operationId: formData.get("uploadId") });
    if (result.success) {
      try {
        updateTag(`advertiser-profile-${profileId}`);
        invalidateActivityAreaAdvertisers(profile?.activityAreas ?? []);
      }
      catch {
        console.error(JSON.stringify({ event: "profile-photo-upload", ...publicImageRuntimeContext(), statusClass: "5xx", correlationId: crypto.randomUUID(), outcome: "failed", cause: "cache_invalidation", profileId, operation: "profile_photo_replace" }));
      }
    }
    return result;
  }
  catch (error) {
    const supportId = error instanceof ClassifiedsRequestError ? error.requestId : crypto.randomUUID();
    if (!(error instanceof ClassifiedsRequestError && error.serverReportedFailure)) console.error(JSON.stringify({ event: "profile-photo-upload", ...publicImageRuntimeContext(), statusClass: "5xx", correlationId: supportId, outcome: "failed", cause: "action", operation: "profile_photo_replace" }));
    return { success: false, error: `Não foi possível enviar a foto do perfil. Código de suporte: ${supportId}.` };
  }
}
