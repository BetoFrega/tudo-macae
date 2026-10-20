import type { AdvertiserProfileData } from "@tudomacae/advertiser-identity/model";
import { hasPublishableProfile, type PendingAdPublication } from "@tudomacae/ads/client";
import type { PendingPhoto } from "@tudomacae/ads/syncPendingPublicationImages";
import type { AdFormSchema } from "../../schemas/adFormSchema";
import { durablePreview } from "./durablePreview";

export type SavedPhoto = { id: string; title: string; description: string; order: number };
type FormImage = AdFormSchema["images"][number];
type PublicationMetadataSource = Pick<AdFormSchema, "title" | "text" | "categoryId" | "subcategoryId"> & { advertiserProfileId?: string | undefined };

// Comparable fingerprint of the saved draft fields; equal fingerprints skip the metadata save.
export function publicationMetadata(source: PublicationMetadataSource): string {
  return JSON.stringify({ title: source.title, text: source.text, categoryId: source.categoryId, subcategoryId: source.subcategoryId, advertiserProfileId: source.advertiserProfileId ?? "" });
}

export function savedPhotoSnapshot(images: PendingAdPublication["images"]): SavedPhoto[] {
  return (images ?? []).map(image => ({ id: image.id, title: image.title ?? "", description: image.description ?? "", order: image.order }));
}

export function hasPhotoChanges(images: (Partial<FormImage> | undefined)[] | undefined, savedPhotos: SavedPhoto[]): boolean {
  if (images?.some(image => image?.file)) return true;
  const current = images?.map((image, order) => ({ id: image?.id, title: image?.title, description: image?.description, order })) ?? [];
  return JSON.stringify(current) !== JSON.stringify(savedPhotos);
}

// Starting journey state; only the first render's result is used by state and ref initializers.
export function initialJourneyState(initial: PendingAdPublication | undefined, profiles: AdvertiserProfileData[], userId: string | undefined) {
  if (!initial) {
    return {
      step: "ad", locked: false, saved: false, savedPhotos: [] as SavedPhoto[], savedMetadata: "", publicationId: undefined, ownerId: userId,
      values: { title: "", text: "", categoryId: "", subcategoryId: "", advertiserProfileId: profiles[0]?.id ?? "", images: [] as FormImage[] },
    };
  }
  const profile = profiles.find(p => p.id === initial.advertiserProfileId) ?? profiles[0];
  return {
    step: initial.published || hasPublishableProfile(profile) ? "publication" : "profile",
    locked: !!initial.published,
    saved: true,
    savedPhotos: savedPhotoSnapshot(initial.images),
    savedMetadata: publicationMetadata(initial),
    publicationId: initial.id,
    ownerId: initial.userId ?? userId,
    values: pendingFormValues(initial, profile?.id ?? ""),
  };
}

function pendingFormValues(initial: PendingAdPublication, advertiserProfileId: string) {
  return {
    title: initial.title ?? "", text: initial.text ?? "", categoryId: initial.categoryId ?? "", subcategoryId: initial.subcategoryId ?? "", advertiserProfileId,
    images: (initial.images ?? []).map(image => ({ ...image, title: image.title ?? "", description: image.description ?? "", url: image.url ?? "" })),
  };
}

export function recoveredFormImages(publication: PendingAdPublication): FormImage[] {
  return (publication.images ?? []).map(image => ({
    ...image,
    title: image.title ?? "",
    description: image.description ?? "",
    url: image.url ?? `/api/publicacoes-pendentes/${encodeURIComponent(publication.id)}/fotos/${encodeURIComponent(image.id)}`,
  }));
}

export function photoSubmissionPayload(operationId: string, images: FormImage[], photoMetadata: string, savedPhotos: SavedPhoto[]): FormData {
  const payload = new FormData();
  payload.append("operationId", operationId);
  payload.append("images", photoMetadata);
  payload.append("observedImageIds", JSON.stringify(savedPhotos.map(image => image.id)));
  payload.append("observedImages", JSON.stringify(savedPhotos));
  images.forEach((image, index) => {
    if (image.file) payload.append(`file-${index}`, image.file);
  });
  return payload;
}

export function photoSaveFailure(imageCount: number, error: string): string {
  return imageCount
    ? `O anúncio foi salvo, mas nem todas as fotos foram enviadas. Elas continuam nesta página. Tente continuar novamente. ${error}`
    : `O anúncio foi salvo, mas não foi possível confirmar a lista de fotos. Tente continuar novamente. ${error}`;
}

// Mutates each image in place: stored path, durable preview for new files, and no pending file.
export async function attachSavedPhotos(images: FormImage[], savedImages: PendingPhoto[], assertCurrentSave: () => void) {
  for (const [index, image] of images.entries()) {
    const savedImage = savedImages[index];
    if (!savedImage || savedImage.id !== image.id) throw new Error("As fotos foram enviadas, mas não foi possível confirmar o salvamento. Recarregue a página e tente novamente.");
    if (image.file) {
      const preview = await durablePreview(image.file);
      assertCurrentSave();
      if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url);
      image.url = preview;
    }
    image.path = savedImage.path;
    image.file = undefined;
  }
}
