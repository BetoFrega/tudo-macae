import { identityDeletionCacheTag } from "@tudomacae/advertiser-identity/identityDeletion";
import { cacheTag } from "next/cache";
import { getAdImageUrl } from "../utils/adImageUrl";
import type { AdData, AdImage } from "@tudomacae/ads/types";
import { getAdUseCase } from "../../../integrations/ads/use-cases/getAdUseCase";
import { verifyAdOwnershipUseCase } from "../../../integrations/ads/use-cases/verifyAdOwnershipUseCase";

export type Ad = Omit<AdData, "images"> & {
  images: (AdImage & { url: string })[];
};

export async function getAd(id: string): Promise<Ad | null> {
  "use cache";
  cacheTag(identityDeletionCacheTag, `ad-${id}`);

  return getAdLive(id);
}

async function getAdLive(id: string): Promise<Ad | null> {
  const adData = await getAdUseCase({ id });

  if (!adData) return null;

  return {
    ...adData,
    images: (adData.images || []).map(img => ({
      ...img,
      url: getAdImageUrl(adData.id, img),
    })),
  };
}

export async function getAdForEdit(id: string, userId: string, isAdmin = false): Promise<Ad> {
  const ad = await verifyAdOwnershipUseCase({ id, userId, isAdmin, includePendingImages: true });
  return {
    ...ad,
    images: ad.images.map(image => ({
      ...image,
      url: image.pending ? "" : getAdImageUrl(ad.id, image),
    })),
  };
}
