import { adManagement } from "../management";

export type { CreateAdParams, CreateAdResult } from "@tudomacae/ads/management";
export const createAdUseCase = adManagement.create;
