import type { Category } from "@tudomacae/categories/model";

type CatalogSubcategory = Category["subcategories"][number];

export interface CatalogSelection {
  category: Category | undefined;
  subcategory: CatalogSubcategory | undefined;
}

export function resolveCatalogSelection(
  categories: Category[],
  categoryId: string | undefined,
  subcategoryId: string | undefined,
): CatalogSelection {
  const category = categoryId
    ? categories.find(candidate => candidate.id === categoryId && candidate.isActive)
    : undefined;
  const subcategory = subcategoryId
    ? category?.subcategories.find(candidate => candidate.id === subcategoryId && candidate.isActive)
    : undefined;
  return { category, subcategory };
}

export function catalogFilter({ category, subcategory }: CatalogSelection) {
  if (category && subcategory) {
    return { activityArea: { categoryId: category.id, subcategoryId: subcategory.id } };
  }
  return category ? { categoryId: category.id } : {};
}

export function analyticsActivityArea({ category, subcategory }: CatalogSelection) {
  return category && subcategory
    ? { categoryId: category.id, subcategoryId: subcategory.id }
    : {};
}

export function catalogHeading({ category, subcategory }: CatalogSelection) {
  if (subcategory) return `Negócios de ${subcategory.name}`;
  if (category) return `Negócios de ${category.name}`;
  return "Negócios de Macaé";
}

export function selectionKey({ category, subcategory }: CatalogSelection) {
  return `${category?.id ?? "all"}:${subcategory?.id ?? "all"}`;
}
