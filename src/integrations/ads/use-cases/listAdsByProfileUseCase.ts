import { adManagement } from "../management";
import { transformAdWithImages } from "@/features/ads/utils/adTransformations";
import type { ListAdsByProfileInput } from "@tudomacae/ads/validation";
import type { Ad } from "./listAdsUseCase";

export async function listAdsByProfileUseCase(params: ListAdsByProfileInput): Promise<Ad[]> {
  return (await adManagement.listForProfile(params)).map(transformAdWithImages);
}
