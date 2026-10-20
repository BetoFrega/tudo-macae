import { publicAdDiscovery } from "@/integrations/ads/publicDiscoveryProduction";
import { type AdWithImages, transformAdWithImages } from "../../../features/ads/utils/adTransformations";

export type Ad = AdWithImages;

export async function listAdsUseCase(params?: {
  maximumResults?: number;
}): Promise<Ad[]> {
  const page = await publicAdDiscovery.read(publicAdDiscovery.canonical({
    scope: { kind: "all" },
    ...(params?.maximumResults === undefined ? {} : { limit: params.maximumResults }),
  }));
  return page.items.map(transformAdWithImages);
}
