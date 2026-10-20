export interface AdUploadImage {
  id: string;
  path: string;
  title?: string | undefined;
  description?: string | undefined;
  order: number;
  pending?: boolean;
}

interface OwnedAd {
  categoryId: string;
  subcategoryId?: string | undefined;
  images: AdUploadImage[];
}

export interface UploadAdImageInput {
  adId: string;
  userId: string;
  file: Buffer;
  mimeType: string;
  title: string;
  description: string;
  uploadId?: string | undefined;
}

export function createAdImageUpload(dependencies: {
  readOwned(adId: string, userId: string): Promise<OwnedAd>;
  read(adId: string): Promise<OwnedAd | null>;
  pathFor(adId: string, uploadId: string, mimeType: string): string;
  store(adId: string, file: Buffer, mimeType: string, uploadId?: string): Promise<{ path: string; created: boolean }>;
  append(adId: string, buildImage: (images: readonly AdUploadImage[]) => AdUploadImage): Promise<AdUploadImage>;
  publish(adId: string, path: string): Promise<void>;
  finalize(adId: string, imageId: string, path: string): Promise<AdUploadImage>;
  remove(adId: string, path: string): Promise<void>;
  newId(): string;
  reportCleanupFailure(uploadId: string, cause: string): void;
}) {
  async function removeUnlinkedUpload(adId: string, imageId: string, storedPath: string) {
    try {
      const latest = await dependencies.read(adId);
      if (!latest?.images.some(candidate => candidate.id === imageId && candidate.path === storedPath)) {
        await dependencies.remove(adId, storedPath);
      }
    }
    catch (cleanupError) {
      dependencies.reportCleanupFailure(imageId, cleanupError instanceof Error ? cleanupError.name : "UnknownError");
    }
  }

  return {
    async upload(input: UploadAdImageInput) {
      const ad = await dependencies.readOwned(input.adId, input.userId);
      const imageId = input.uploadId ?? dependencies.newId();
      const existingImage = ad.images.find(image => image.id === imageId);
      const path = dependencies.pathFor(input.adId, imageId, input.mimeType);
      const image = existingImage ?? await dependencies.append(input.adId, (images) => {
        const committed = images.find(item => item.id === imageId);
        if (committed) return committed;
        if (images.length >= 3) throw new Error("Maximum of 3 images allowed per ad");
        return { id: imageId, path, title: input.title, description: input.description, order: images.length, pending: true };
      });
      let storedPath: string | undefined;
      try {
        if (image.pending) {
          if (image.path !== path) throw new Error("Este envio usa outra foto. Selecione-a novamente.");
          const stored = await dependencies.store(input.adId, input.file, input.mimeType, imageId);
          storedPath = stored.path;
          if (stored.path !== image.path) throw new Error("O envio da foto não corresponde ao anúncio.");
        }
        await dependencies.publish(input.adId, image.path);
        const finalized = await dependencies.finalize(input.adId, image.id, image.path);
        return { image: finalized, categoryId: ad.categoryId, subcategoryId: ad.subcategoryId };
      }
      catch (error) {
        if (storedPath) await removeUnlinkedUpload(input.adId, imageId, storedPath);
        throw error;
      }
    },
  };
}
