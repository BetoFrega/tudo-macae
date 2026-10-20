import { InvalidPhotoBytes } from "./sanitizeAdPhoto";

/** The API Worker decodes and re-encodes photos; this only rejects envelopes it would refuse. */
export async function prepareAdPhoto(file: File) {
  if (!file.size || file.size > 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new InvalidPhotoBytes();
  return file;
}
