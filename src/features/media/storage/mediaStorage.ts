import type { Media } from "@tudomacae/media/model";

/** Cached metadata points at a stable preview whose route authenticates every request. */
export async function getMediaPreviewUrl(media: Media): Promise<string> {
  return `/midia/${encodeURIComponent(media.id)}`;
}
