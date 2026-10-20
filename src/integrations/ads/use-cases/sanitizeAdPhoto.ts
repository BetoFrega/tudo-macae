import type { Sharp } from "sharp";

export class PhotoUploadTooLarge extends Error {}
export class InvalidPhotoBytes extends Error {}

const MAX_PHOTO_BYTES = 1024 * 1024;

/** Re-encodes as WebP, shrinking until it fits the 1MB Classifieds photo limit. */
export async function encodeWithinPhotoLimit(image: Sharp): Promise<Buffer> {
  for (const [width, quality] of [[1920, 75], [1920, 55], [1920, 35], [1280, 35], [960, 25]] as const) {
    const sanitized = await image.clone().rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (sanitized.byteLength <= MAX_PHOTO_BYTES) return sanitized;
  }
  throw new PhotoUploadTooLarge();
}
