import type { ActivityArea } from "./model";
import type { BusinessCategory as Category } from "./taxonomy";
import type { ResolvedBusinessActivity } from "./businessPresentation";

export function resolveBusinessActivities(
  activityAreas: ActivityArea[],
  categories: Category[],
): ResolvedBusinessActivity[] {
  return activityAreas.flatMap((area) => {
    const category = categories.find(candidate =>
      candidate.id === area.categoryId && candidate.isActive,
    );
    const subcategory = category?.subcategories.find(candidate =>
      candidate.id === area.subcategoryId && candidate.isActive,
    );
    if (!category || !subcategory) return [];
    return [{
      ...area,
      categoryName: category.name,
      subcategoryName: subcategory.name,
      href: `/negocios?categoria=${encodeURIComponent(category.id)}&subcategoria=${encodeURIComponent(subcategory.id)}&origem=business_profile`,
    }];
  });
}
