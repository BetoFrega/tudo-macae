import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { Ad } from "../../../integrations/ads/use-cases/listAdsUseCase";
import { listAdsByUserUseCase } from "../../../integrations/ads/use-cases/listAdsByUserUseCase";

export type { Ad };

export async function listUserAds(params?: { userId?: string }): Promise<Ad[]> {
  let userId = params?.userId;

  if (!userId) {
    const user = await getCurrentUser();
    if (!user) {
      return [];
    }
    userId = user.uid;
  }

  return await listAdsByUserUseCase({ userId });
}
