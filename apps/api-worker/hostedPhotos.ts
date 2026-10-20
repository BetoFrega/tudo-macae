import { createHostedPhotoObjects } from "./lib/storage/hostedPhotos";
import { createD1HostedPhotoJournal } from "./lib/db/hostedPhotos";
import { createClassifiedsPersistence } from "./classifieds";
import { createClassifiedsPhotos, createClassifiedsPhotoSanitizer } from "./classifiedsPhotos";
import type { PhotoDependencies } from "@tudomacae/classifieds-photos";

/** Explicit preparation; importing this entry never activates a provider. */
export function createHostedPhotos(input: Parameters<typeof createHostedPhotoObjects>[0] & { database: D1Database }) {
  return createHostedPhotoObjects(input, createD1HostedPhotoJournal(createClassifiedsPersistence({ database: input.database })));
}

export function createHostedClassifiedsPhotos(input: {
  database: D1Database; images: Pick<ImagesBinding, "info" | "input"> & { hosted: Parameters<typeof createHostedPhotoObjects>[0]["images"] }; purge: PhotoDependencies["purge"]; observe: PhotoDependencies["observe"];
  now?: () => number; newId?: () => string; send?: typeof fetch; context?: Parameters<typeof createHostedPhotoObjects>[0]["context"];
}) {
  const now = input.now ?? Date.now;
  const newId = input.newId ?? (() => crypto.randomUUID());
  return createClassifiedsPhotos({ ...input, now, newId, normalizedMimeType: "image/jpeg", normalize: createClassifiedsPhotoSanitizer(input.images), objects: createHostedPhotos({ database: input.database,
    images: input.images.hosted, send: input.send ?? fetch, now, newId, context: input.context }) });
}
