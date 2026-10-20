import type { Category } from "@tudomacae/categories/model";
import { cacheLife, cacheTag } from "next/cache";
import { listBusinessCatalogActivityAreasUseCase } from "@/packages/classifieds-api";
import { businessCatalogTaxonomyTag } from "@/features/advertiser-profile/actions/activityAreas";
import { filterBusinessCatalogCategories } from "./filterBusinessCatalogCategories";

export async function getBusinessCatalogCategories(
  categories: Category[],
): Promise<Category[]> {
  "use cache";

  cacheLife("hours");
  cacheTag("categories", businessCatalogTaxonomyTag);
  const activityAreas = await listBusinessCatalogActivityAreasUseCase();

  return filterBusinessCatalogCategories(categories, activityAreas);
}
