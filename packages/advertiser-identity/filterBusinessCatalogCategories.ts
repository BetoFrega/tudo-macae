import type { BusinessCategory as Category } from "./taxonomy";
import type { ActivityArea } from "./model";
import { orderBusinessTaxonomy } from "./taxonomy";

function activityKey(categoryId: string, subcategoryId: string) {
  return `${categoryId}:${subcategoryId}`;
}

export function filterBusinessCatalogCategories<T extends Category>(
  categories: T[],
  activityAreas: ActivityArea[],
): T[] {
  const representedAreas = new Set(
    activityAreas.map(area => activityKey(area.categoryId, area.subcategoryId)),
  );

  return orderBusinessTaxonomy(categories.flatMap((category) => {
    if (!category.isActive) return [];
    const subcategories = category.subcategories.filter(subcategory =>
      subcategory.isActive
      && representedAreas.has(activityKey(category.id, subcategory.id)));
    return subcategories.length > 0 ? [{ ...category, subcategories }] : [];
  }));
}
