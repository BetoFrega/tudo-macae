import { AdOperationError } from "./operationError";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { type UpdateAdInput, updateAdInput } from "./validation";
import type { AdMutationFields } from "./adMutations";

interface AdUpdateRecord {
  images: Array<{ id: string; path: string; order: number; title?: string | undefined; description?: string | undefined; pending?: boolean }>;
}

export interface UpdateAdResult { slug: string }

type AdUpdateImage = AdUpdateRecord["images"][number];

function submittedImagesFrom(images: UpdateAdInput["images"], existingImages: readonly AdUpdateImage[]) {
  const existingImagesById = new Map(existingImages.map(image => [image.id, image]));
  return images?.map((image) => {
    const existingImage = existingImagesById.get(image.id);
    if (!existingImage) {
      throw new AdOperationError("conflict", `Unknown ad image: ${image.id}`);
    }

    return {
      ...image,
      path: existingImage.path,
      ...(existingImage.pending && { pending: true }),
    };
  });
}

function planImageChanges(submittedImages: ReturnType<typeof submittedImagesFrom>, existingImages: readonly AdUpdateImage[], observedImageIds: ReadonlySet<string>) {
  if (!submittedImages) return { finalImages: undefined, cancelledImages: [] };
  const isSubmitted = (image: AdUpdateImage) => submittedImages.some(submitted => submitted.id === image.id);
  const finalImages = [
    ...submittedImages,
    ...existingImages.filter(img => img.pending && !observedImageIds.has(img.id) && !isSubmitted(img)),
  ];
  const cancelledImages = existingImages.filter(image => observedImageIds.has(image.id) && !finalImages.some(submitted => submitted.id === image.id));
  return { finalImages, cancelledImages };
}

function imageUpdateFields({ finalImages, cancelledImages }: ReturnType<typeof planImageChanges>, observedImageIds: ReadonlySet<string>) {
  return {
    ...(finalImages && { images: finalImages }),
    ...(finalImages && { imageSnapshotIds: [...observedImageIds] }),
    ...(cancelledImages.length && {
      cancelImageIds: cancelledImages.map(image => image.id),
      cancelImagePaths: cancelledImages.map(image => image.path),
    }),
  };
}

export function createAdUpdate(dependencies: {
  read(id: string, includePending: boolean): Promise<AdUpdateRecord | null>;
  update(id: string, fields: AdMutationFields): Promise<void>;
  pendingCleanup(id: string): Promise<string[]>;
  remove(input: { adId: string; path: string; correlationId: string }): Promise<void | "deferred">;
  acknowledge(id: string, path: string, removalConfirmed: boolean): Promise<void>;
  correlationId(): string;
  jobId(path: string): string;
  report(event: { correlationId: string; jobId: string; cause: string }): void;
}) {
  async function removePendingCleanup(adId: string) {
    for (const path of await dependencies.pendingCleanup(adId)) {
      const correlationId = dependencies.correlationId();
      try {
        const outcome = await dependencies.remove({ adId, path, correlationId });
        await dependencies.acknowledge(adId, path, outcome !== "deferred");
      }
      catch (error) {
        dependencies.report({ correlationId, jobId: dependencies.jobId(path), cause: error instanceof Error ? error.name : "UnknownError" });
      }
    }
  }

  const update = async function updateAdUseCase(
    params: UpdateAdInput,
  ): Promise<UpdateAdResult> {
    // Validate input
    const validatedParams = updateAdInput.parse(params);

    // Generate slug from title
    const slug = slugify(validatedParams.title);

    // Fetch existing ad to check for removed images
    const existingAd = await dependencies.read(validatedParams.id, true);

    const existingImages = existingAd?.images ?? [];
    const submittedImages = submittedImagesFrom(validatedParams.images, existingImages);
    const observedImageIds = new Set(validatedParams.observedImageIds ?? []);
    const imageChanges = planImageChanges(submittedImages, existingImages, observedImageIds);

    await dependencies.update(validatedParams.id, {
      categoryId: validatedParams.categoryId,
      subcategoryId: validatedParams.subcategoryId,
      title: validatedParams.title,
      slug,
      text: validatedParams.text,
      ...(validatedParams.advertiserProfileId && { advertiserProfileId: validatedParams.advertiserProfileId }),
      ...(validatedParams.status && { status: validatedParams.status }),
      ...imageUpdateFields(imageChanges, observedImageIds),
    });

    await removePendingCleanup(validatedParams.id);

    return { slug };
  };
  return { update };
}
