import { getAdImageUrl } from "./adImageUrl";
import type { AdData, AdImage } from "@tudomacae/ads/types";

export type AdWithImages = Omit<AdData, "images"> & {
  images: (AdImage & { url: string })[];
};

export function transformAdWithImages(ad: AdData): AdWithImages {
  return {
    ...ad,
    images: (ad.images || []).map(img => ({
      ...img,
      url: getAdImageUrl(ad.id, img),
    })),
  };
}
