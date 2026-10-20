import { adManagement } from "../management";

export type { AdData as Ad } from "@tudomacae/ads/types";
export const listAllAdsUseCase = adManagement.listAll;
