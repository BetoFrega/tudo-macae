import { CategoryManagementError } from "./categoryManagement";
import type { CategoryPage, CategoryRecord, SubcategoryRecord } from "./categoryManagement";

export { CategoryManagementError } from "./categoryManagement";

export interface CategoryWithSubcategories extends CategoryRecord {
  subcategories: Omit<SubcategoryRecord, "categoryId">[];
}

export interface CategoryCatalogDependencies {
  listCategories(input: { limit?: number; cursor?: string }): Promise<CategoryPage<CategoryRecord>>;
  listSubcategories(input: { categoryId: string; limit?: number; cursor?: string }): Promise<CategoryPage<SubcategoryRecord>>;
}

/** Builds the public category catalog while tolerating a parent removed after its list snapshot. */
export function createCategoryCatalog(dependencies: CategoryCatalogDependencies) {
  return {
    async list(): Promise<CategoryWithSubcategories[]> {
      const categories: CategoryRecord[] = [];
      let categoryCursor: string | undefined;
      do {
        const page = await dependencies.listCategories({
          limit: 50,
          ...(categoryCursor ? { cursor: categoryCursor } : {}),
        });
        categories.push(...page.items);
        categoryCursor = page.nextCursor;
      } while (categoryCursor);

      const resolved = await Promise.all(categories.map(async (category) => {
        try {
          return {
            ...category,
            subcategories: await listAllSubcategories(dependencies, category.id),
          };
        }
        catch (error) {
          if (error instanceof CategoryManagementError && error.code === "notFound") return null;
          throw error;
        }
      }));
      return resolved.filter((category): category is CategoryWithSubcategories => category !== null);
    },
  };
}

async function listAllSubcategories(
  dependencies: CategoryCatalogDependencies,
  categoryId: string,
): Promise<Omit<SubcategoryRecord, "categoryId">[]> {
  const subcategories: Omit<SubcategoryRecord, "categoryId">[] = [];
  let cursor: string | undefined;
  do {
    const page = await dependencies.listSubcategories({
      categoryId,
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    subcategories.push(...page.items.map(({ categoryId: _, ...subcategory }) => subcategory));
    cursor = page.nextCursor;
  } while (cursor);
  return subcategories;
}
