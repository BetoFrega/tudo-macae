import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { classifiedsPhotos, classifiedsPhotoCredential } from "@/packages/classifieds-api/photos";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { z } from "zod";
const failed = (error: string) => ({ success: false as const, error });

function validatePhotoFile(file: unknown) {
  if (!(file instanceof File)) return failed("Escolha uma foto para enviar.");
  if (!file.size || file.size > 1024 * 1024) return failed("A foto deve ter no máximo 1MB.");
  const mimeType = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).safeParse(file.type);
  if (!mimeType.success) return failed("Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF.");
  return { file, mimeType: mimeType.data };
}

function photoRefusal(error: PhotoError) {
  if (error.code === "invalid" || error.code === "retired") return { ...failed(error.message), reason: "invalid_photo" as const };
  return failed(error.message);
}

function uploadFailure(error: unknown, correlationId: string) {
  if (error instanceof PhotoError && error.code !== "unavailable") return photoRefusal(error);
  if (error instanceof z.ZodError) return failed("Identificador de envio inválido.");
  const supportId = error instanceof ClassifiedsRequestError ? error.requestId : correlationId;
  if (!(error instanceof ClassifiedsRequestError && error.serverReportedFailure)) console.error(JSON.stringify({ event: "profile-photo-upload", ...publicImageRuntimeContext(), outcome: "failed", cause: "upload", correlationId: supportId, operation: "profile_photo_replace" }));
  return failed(`Não foi possível enviar a foto do perfil. Código de suporte: ${supportId}.`);
}

/** The API Worker checks ownership, so `userId` and `isAdmin` only describe the caller. */
export async function uploadAdvertiserProfilePhoto(input: { profileId: string; userId: string; isAdmin: boolean; expectedRevision: number; file: File | null; operationId?: FormDataEntryValue | null }) {
  const correlationId = crypto.randomUUID();
  try {
    const valid = validatePhotoFile(input.file);
    if ("error" in valid) return valid;
    const operationId = z.uuid().parse(input.operationId ?? correlationId);
    const photo = await classifiedsPhotos().upload({ ownerKind: "profile", ownerId: input.profileId, operationId, expectedRevision: input.expectedRevision,
      bytes: new Uint8Array(await valid.file.arrayBuffer()), mimeType: valid.mimeType,
    }, await classifiedsPhotoCredential(), correlationId);
    return { success: true as const, photoURL: `/api/classifieds/photos/public/${encodeURIComponent(photo.path)}` };
  }
  catch (error) {
    return uploadFailure(error, correlationId);
  }
}
