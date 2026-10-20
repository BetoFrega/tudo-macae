import { adManagement } from "../management";
import { transformAdWithImages } from "@/features/ads/utils/adTransformations";
import type { ListAdsByUserInput } from "@tudomacae/ads/validation";
import type { Ad } from "./listAdsUseCase";

export async function listAdsByUserUseCase(params: ListAdsByUserInput): Promise<Ad[]> {
  return (await adManagement.listForUser(params)).map(transformAdWithImages);
}
