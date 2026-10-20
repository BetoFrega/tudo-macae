import type { Media } from "@tudomacae/media/model";
import { getMediaPreviewUrl } from "./storage/mediaStorage";

import type { MediaOption } from "@tudomacae/media/options";
export type { MediaOption, MediaOptionsResult } from "@tudomacae/media/options";

export async function toMediaOption({ storagePath, ...media }: Media): Promise<MediaOption> {
  return {
    ...media,
    url: await getMediaPreviewUrl({ ...media, storagePath }),
  };
}
