import { revalidateTag, updateTag } from "next/cache";
import type { ActivityArea } from "@tudomacae/advertiser-identity/model";
import {
  activityAreaAdvertisersTag,
  businessCatalogTaxonomyTag,
} from "./activityAreas";

export function invalidateActivityAreaAdvertisers(areas: ActivityArea[]): void {
  const tags = new Set(areas.map(activityAreaAdvertisersTag));
  if (tags.size === 0) return;
  for (const tag of tags) {
    revalidateTag(tag, "max");
    updateTag(tag);
  }
  revalidateTag(businessCatalogTaxonomyTag, "max");
  updateTag(businessCatalogTaxonomyTag);
}
