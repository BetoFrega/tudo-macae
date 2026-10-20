import type { Ad } from "../../../integrations/ads/use-cases/listAdsUseCase";
import { listAdsByUserUseCase } from "../../../integrations/ads/use-cases/listAdsByUserUseCase";
import { listAdsUseCase } from "../../../integrations/ads/use-cases/listAdsUseCase";

export async function listAds(params?: {
  userId?: string;
  maximumResults?: number;
}): Promise<Ad[]> {
  if (params?.userId) {
    return await listAdsByUserUseCase({ userId: params.userId });
  }
  return params?.maximumResults === undefined
    ? await listAdsUseCase()
    : await listAdsUseCase({ maximumResults: params.maximumResults });
}
