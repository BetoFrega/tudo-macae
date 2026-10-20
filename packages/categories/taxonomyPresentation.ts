import type { CategoryWithSubcategories as Category } from "./categoryCatalog";

export { orderBusinessTaxonomy } from "@tudomacae/advertiser-identity/taxonomy";

export function firstDiscoveryLayer(
  preferredLayer: Category["preferredLayer"],
  hasAds: boolean,
  hasBusinesses: boolean,
): "ads" | "businesses" {
  if (hasAds && !hasBusinesses) return "ads";
  if (hasBusinesses && !hasAds) return "businesses";
  if (!hasAds && !hasBusinesses) return "businesses";
  return preferredLayer ?? "ads";
}
