"use server";

import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { updateTag } from "next/cache";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { adListingTags } from "@tudomacae/ads";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { InvalidPhotoBytes, PhotoUploadTooLarge } from "../../../integrations/ads/use-cases/sanitizeAdPhoto";
import { prepareAdPhoto } from "../../../integrations/ads/use-cases/prepareAdPhoto";
import { uploadAdImageUseCase } from "../../../integrations/ads/use-cases/uploadAdImageUseCase";

type UploadAdImageResult
  = | { success: true }
    | { success: false; error: string; reason?: "authentication_required" | "rate_limit" | "invalid_photo" };

type UploadRejection = Extract<UploadAdImageResult, { success: false }>;
type UploadStage = "authentication" | "file_read" | "upload" | "cache_invalidation";

const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function uploadAdImage(
  adId: string,
  formData: FormData,
): Promise<UploadAdImageResult> {
  const requestedUploadId = formData.get("uploadId");
  const correlationId = isUploadId(requestedUploadId) ? requestedUploadId : crypto.randomUUID();
  let stage: UploadStage = "authentication";
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: "Entre na sua conta para enviar imagens ao anúncio.",
        reason: "authentication_required",
      };
    }

    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";
    const file = acceptedUploadFile(requestedUploadId, formData.get("file"));
    if (!(file instanceof File)) return file;

    stage = "file_read";
    const sanitized = await prepareAdPhoto(file);
    const arrayBuffer = await sanitized.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    stage = "upload";
    const result = await uploadAdImageUseCase({
      adId,
      userId: user.uid,
      file: buffer,
      mimeType: sanitized.type,
      title,
      description,
      uploadId: correlationId,
    });

    stage = "cache_invalidation";
    updateTag(`ad-${adId}`);
    for (const tag of adListingTags(result)) {
      updateTag(tag);
    }
    return { success: true };
  }
  catch (error) {
    return uploadFailure(error, stage, correlationId);
  }
}

function isUploadId(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && uploadIdPattern.test(value);
}

function acceptedUploadFile(requestedUploadId: FormDataEntryValue | null, file: FormDataEntryValue | null): File | UploadRejection {
  if (requestedUploadId !== null && !isUploadId(requestedUploadId)) {
    return { success: false, error: "Identificador de envio inválido." };
  }
  if (!file) {
    return { success: false, error: "Escolha uma imagem para enviar." };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "Escolha uma imagem válida (JPEG, PNG, WebP ou GIF)." };
  }
  if (file.size > 1 * 1024 * 1024) {
    return { success: false, reason: "invalid_photo", error: "A imagem deve ter no máximo 1MB." };
  }
  return file;
}

function photoRejection(error: PhotoError): UploadRejection {
  if (error.code === "rate_limit") return { success: false, error: error.message, reason: "rate_limit" };
  if (error.code === "invalid" || error.code === "retired") return { success: false, error: error.message, reason: "invalid_photo" };
  return { success: false, error: error.message };
}

function expectedRejection(error: unknown): UploadRejection | undefined {
  if (error instanceof PhotoError && error.code !== "unavailable") return photoRejection(error);
  if (error instanceof AdOperationError) return { success: false, error: error.message };
  if (error instanceof InvalidPhotoBytes) return { success: false, reason: "invalid_photo", error: "Escolha uma imagem válida (JPEG, PNG, WebP ou GIF)." };
  if (error instanceof PhotoUploadTooLarge) return { success: false, reason: "invalid_photo", error: "A imagem deve ter no máximo 1MB." };
  return undefined;
}

function uploadFailure(error: unknown, stage: UploadStage, correlationId: string): UploadRejection {
  const expected = expectedRejection(error);
  if (expected) return expected;
  const supportId = error instanceof ClassifiedsRequestError ? error.requestId : correlationId;
  if (!(error instanceof ClassifiedsRequestError && error.serverReportedFailure)) console.error(JSON.stringify({
    event: "ads.image_upload.failed",
    ...publicImageRuntimeContext(),
    outcome: "unexpected_failure",
    cause: stage,
    correlationId: supportId,
  }));
  return {
    success: false,
    error: `Não foi possível enviar a imagem do anúncio. Código de suporte: ${supportId}.`,
  };
}
