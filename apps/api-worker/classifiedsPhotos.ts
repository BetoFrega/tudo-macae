import { createPhotoLifecycle, type PhotoDependencies, type PhotoObjects } from "@tudomacae/classifieds-photos";
import { createD1ClassifiedsPersistence } from "./lib/db/classifieds";
import { createD1PhotoStore } from "./lib/db/classifiedsPhotos";
import { createR2PhotoObjects } from "./lib/storage/classifiedsPhotos";
import { createHash } from "node:crypto";
import { createClassifiedsPhotoDecoder } from "./lib/storage/classifiedsPhotoDecoder";

export function createClassifiedsPhotos(input: {
  database: D1Database; images: Pick<ImagesBinding, "info" | "input">; purge: PhotoDependencies["purge"]; observe: PhotoDependencies["observe"];
  now?: () => number; newId?: () => string;
  normalize?: PhotoDependencies["normalize"]; normalizedMimeType?: PhotoDependencies["normalizedMimeType"];
} & ({ bucket: R2Bucket; objects?: never } | { objects: PhotoObjects; bucket?: never })) {
  const persistence = createD1ClassifiedsPersistence({ database: input.database });
  return createPhotoLifecycle({
    store: createD1PhotoStore(input.database, persistence), objects: input.objects ?? createR2PhotoObjects(input.bucket!),
    decode: createClassifiedsPhotoDecoder(input.images),
    normalize: input.normalize, normalizedMimeType: input.normalizedMimeType,
    now: input.now ?? Date.now, newId: input.newId ?? (() => crypto.randomUUID()),
    digest: async bytes => createHash("sha256").update(bytes).digest("hex"), purge: input.purge, observe: input.observe,
  });
}
export { createD1PhotoStore } from "./lib/db/classifiedsPhotos";
export { createR2PhotoObjects } from "./lib/storage/classifiedsPhotos";
export { createClassifiedsPhotoPurge } from "./lib/classifiedsPhotoPurge";
export { createClassifiedsPhotoRenderer } from "./lib/storage/classifiedsPhotoRenderer";
export { createClassifiedsPhotoDecoder, createClassifiedsPhotoSanitizer, ClassifiedsPhotoDecodeUnavailable } from "./lib/storage/classifiedsPhotoDecoder";
