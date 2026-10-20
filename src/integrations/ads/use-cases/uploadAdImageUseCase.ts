import { z } from "zod";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { classifiedsPhotos, classifiedsPhotoCredential } from "@/packages/classifieds-api/photos";
import type { UploadAdImageInput } from "@tudomacae/ads/adImageUpload";
import { verifyAdOwnershipUseCase } from "./verifyAdOwnershipUseCase";

export async function uploadAdImageUseCase(input: UploadAdImageInput) {
  const operationId = input.uploadId ?? crypto.randomUUID();
  const ad = await verifyAdOwnershipUseCase({ id: input.adId, userId: input.userId, includePendingImages: true });
  if (!ad.revision) throw new PhotoError("conflict", "Releia o anúncio antes de enviar a foto.");
  const existing = ad.images.find(image => image.id === operationId);
  const photo = await classifiedsPhotos().upload({ ownerKind: "ad", ownerId: input.adId, operationId,
    expectedRevision: existing?.uploadRevision ?? ad.revision, bytes: new Uint8Array(input.file),
    title: input.title, description: input.description,
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).parse(input.mimeType),
  }, await classifiedsPhotoCredential(), operationId);
  return { image: { id: photo.id, path: photo.path, title: photo.title, description: photo.description,
    order: existing?.order ?? ad.images.length, url: `/api/anuncios/${encodeURIComponent(input.adId)}/fotos/${encodeURIComponent(photo.id)}` },
  categoryId: ad.categoryId, subcategoryId: ad.subcategoryId };
}
