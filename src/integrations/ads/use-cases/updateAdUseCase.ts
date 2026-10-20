import { route } from "@/packages/classifieds-api/route";
import type { createAdUpdate } from "@tudomacae/ads/adUpdate";

export type { UpdateAdResult } from "@tudomacae/ads/adUpdate";
export const updateAdUseCase = route<ReturnType<typeof createAdUpdate>["update"]>("ads.update", input => input, true);
