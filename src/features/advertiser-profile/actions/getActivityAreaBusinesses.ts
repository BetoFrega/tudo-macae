"use server";

import { cacheLife, cacheTag } from "next/cache";
import { activityAreaCivilDate } from "@tudomacae/advertiser-identity/profiles";
import { listActivityAreaBusinessPreviewUseCase } from "@/packages/classifieds-api";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";
import { activityAreaAdvertisersTag } from "./activityAreas";

export async function getActivityAreaBusinesses(
  area: ActivityArea,
): Promise<BusinessPublicData[]> {
  return getCachedActivityAreaBusinesses({
    ...area,
    civilDate: activityAreaCivilDate(Date.now()),
  });
}

async function getCachedActivityAreaBusinesses(
  input: ActivityArea & { civilDate: string },
): Promise<BusinessPublicData[]> {
  "use cache";

  cacheLife("hours");
  cacheTag("categories", activityAreaAdvertisersTag(input));
  return listActivityAreaBusinessPreviewUseCase(input);
}
