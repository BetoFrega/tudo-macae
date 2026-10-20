import type { ActivityArea } from "@tudomacae/advertiser-identity/model";

export const businessCatalogTaxonomyTag = "business-catalog-taxonomy";

export function activityAreaAdvertisersTag(area: ActivityArea): string {
  return `activity-area-advertisers:${encodeURIComponent(area.categoryId)}:${encodeURIComponent(area.subcategoryId)}`;
}
