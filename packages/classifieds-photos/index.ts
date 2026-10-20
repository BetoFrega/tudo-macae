import { buildPhotoLifecycle } from "./lib/lifecycle";
import type { PhotoDependencies } from "./lib/contracts";
export * from "./lib/contracts";
export type { PhotoUpload } from "./lib/lifecycle";
export function createPhotoLifecycle(dependencies: PhotoDependencies) {
  return buildPhotoLifecycle(dependencies);
}
export { createReservedPhotoObjects, PhotoObjectUnavailable, type PhotoObjectReservation, type PhotoObjectJournal, type ReservedObjectRecord, type ReservedObjects, type ReservedPhotoProvider } from "./lib/objectReservations";
