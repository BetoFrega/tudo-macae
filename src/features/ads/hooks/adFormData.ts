import type { AdImage } from "@tudomacae/ads/types";
import type { AdFormSchema } from "../schemas/adFormSchema";

type FormImage = AdFormSchema["images"][number];

export interface InitialData extends Omit<Partial<AdFormSchema>, "images"> {
  images?: (AdImage & { url: string })[];
}

export function buildDefaultValues(initialData: InitialData | undefined, fallbackProfileId: string) {
  const data: InitialData = initialData ?? {};
  return {
    title: data.title || "",
    categoryId: data.categoryId || "",
    subcategoryId: data.subcategoryId || "",
    text: data.text || "",
    advertiserProfileId: data.advertiserProfileId || fallbackProfileId,
    status: data.status || "paused",
    images: toFormImages(data.images),
  };
}

function toFormImages(images: InitialData["images"]) {
  return images?.map(img => ({
    id: img.id,
    path: img.path,
    pending: img.pending,
    url: img.url,
    order: img.order,
    title: img.title || "",
    description: img.description || "",
  })) || [];
}

export function buildAdFormData(values: AdFormSchema): FormData {
  const formData = new FormData();
  formData.append("title", values.title);
  formData.append("categoryId", values.categoryId);
  formData.append("subcategoryId", values.subcategoryId);
  formData.append("text", values.text);
  if (values.advertiserProfileId) {
    formData.append("advertiserProfileId", values.advertiserProfileId);
  }
  if (values.status) {
    formData.append("status", values.status);
  }
  return formData;
}

export function existingImagesPayload(images: FormImage[]) {
  return images
    .filter(img => !img.file && img.id)
    .map(img => ({
      id: img.id,
      path: img.path,
      title: img.title,
      description: img.description,
      order: img.order,
    }));
}

export function buildImageUploadData(image: FormImage, uploadId: string): FormData {
  const imageFormData = new FormData();
  imageFormData.append("file", image.file!);
  imageFormData.append("uploadId", uploadId);
  if (image.title) imageFormData.append("title", image.title);
  if (image.description) imageFormData.append("description", image.description);
  return imageFormData;
}

export function pendingImageName(image: FormImage): string {
  const title = image.title?.trim();
  return title
    ? `${title} (${fileLabel(image, "arquivo sem nome")})`
    : fileLabel(image, "Foto sem nome");
}

function fileLabel(image: FormImage, fallback: string): string {
  return image.originalFileName ?? image.file?.name ?? fallback;
}
