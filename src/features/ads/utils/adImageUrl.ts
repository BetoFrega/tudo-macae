import type { AdImage } from "@tudomacae/ads/types";

/** Every ad photo, pending or published, is served by the API Worker through the ad photo route. */
export function getAdImageUrl(adId: string, image: AdImage): string {
  return image.url || `/api/anuncios/${encodeURIComponent(adId)}/fotos/${encodeURIComponent(image.id)}`;
}
