import { z } from "zod";
import { publicationPhotosInput } from "@tudomacae/ads/publicationPhotos";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { readPublication } from "./publication";
import { route } from "@/packages/classifieds-api/route";
import { classifiedsPhotos, classifiedsPhotoCredential } from "@/packages/classifieds-api/photos";
import type { PendingPhoto } from "@tudomacae/ads/syncPendingPublicationImages";

type PublicationPhotosInput = z.infer<typeof publicationPhotosInput>;
type PhotosClient = ReturnType<typeof classifiedsPhotos>;
type PhotoCredential = Awaited<ReturnType<typeof classifiedsPhotoCredential>>;

function parsePublicationPhotosForm(id: string, formData: FormData): PublicationPhotosInput {
  return publicationPhotosInput.parse({ id, operationId: formData.get("operationId"), images: JSON.parse(String(formData.get("images"))), observedImages: JSON.parse(String(formData.get("observedImages") ?? "[]")) });
}

async function readWritablePublication(userId: string, id: string) {
  const current = await readPublication(userId, id);
  if (!current || current.published || current.deleting || !current.revision) throw new PhotoError("conflict", "Releia a publicação antes de salvar as fotos.");
  return { ...current, revision: current.revision };
}

function photoFile(formData: FormData, index: number): File {
  const file = formData.get(`file-${index}`);
  if (!(file instanceof File)) throw new PhotoError("invalid", "Escolha uma foto válida para continuar.");
  return file;
}

async function uploadPendingPhoto(
  context: { userId: string; id: string; formData: FormData; operationId: string; client: PhotosClient; credential: PhotoCredential },
  image: PublicationPhotosInput["images"][number],
  index: number,
): Promise<void> {
  const { userId, id, formData, operationId, client, credential } = context;
  const current = await readWritablePublication(userId, id);
  const existing = current.images?.find(item => item.id === image.id);
  if (existing && !existing.pending) return;
  const file = photoFile(formData, index);
  await client.upload({ ...(!existing ? { pendingPublication: true as const } : {}), ownerKind: "ad", ownerId: id, operationId: image.id, expectedRevision: existing?.uploadRevision ?? current.revision,
    title: image.title, description: image.description, mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).parse(file.type), bytes: new Uint8Array(await file.arrayBuffer()) }, credential, operationId);
}

export async function syncPendingPublicationImages(userId: string, id: string, formData: FormData, operationId: string) {
  const client = classifiedsPhotos();
  const value = parsePublicationPhotosForm(id, formData);
  const credential = await classifiedsPhotoCredential();
  const context = { userId, id, formData, operationId, client, credential };
  for (const [index, image] of value.images.entries()) {
    await uploadPendingPhoto(context, image, index);
  }
  return route<(input: PublicationPhotosInput) => Promise<PendingPhoto[]>>("publications.photos", input => input, true)(value);
}
