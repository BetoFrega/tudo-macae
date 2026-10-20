import { route } from "@/packages/classifieds-api/route";
import type { createAdMutations } from "@tudomacae/ads/adMutations";

export const setAdStatus = route<ReturnType<typeof createAdMutations>["updateStatus"]>("ads.status", input => input, true);
