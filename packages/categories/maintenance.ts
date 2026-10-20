import type { CategoryRecord, SubcategoryRecord, createCategoryManagement } from "./categoryManagement";
import { updateSubcategorySchema } from "./validation";

export interface CategorySeed {
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  subcategories: { name: string; slug: string; order: number; isActive: boolean }[];
}

export function createCategoryMaintenance(dependencies: {
  management: ReturnType<typeof createCategoryManagement>;
  categories: { findBySlug(slug: string): Promise<CategoryRecord | null> };
  subcategories: {
    findBySlug(categoryId: string, slug: string): Promise<Omit<SubcategoryRecord, "categoryId"> | null>;
    update(categoryId: string, subcategoryId: string, input: Omit<SubcategoryRecord, "id" | "categoryId">): Promise<void>;
  };
  slugify(text: string): string;
  newIdempotencyKey(): string;
}) {
  return {
    async updateSubcategory(input: unknown): Promise<void> {
      const { categoryId, subcategoryId, businessOrder, ...data } = updateSubcategorySchema.parse(input);
      await dependencies.subcategories.update(categoryId, subcategoryId, {
        ...data,
        ...(businessOrder !== undefined ? { businessOrder } : {}),
        slug: dependencies.slugify(data.slug),
      });
    },
    async resolveSubcategoryBySlugs(categorySlug: string, subcategorySlug: string) {
      const category = await dependencies.categories.findBySlug(categorySlug);
      if (!category) return null;
      const subcategory = await dependencies.subcategories.findBySlug(category.id, subcategorySlug);
      return subcategory ? { categoryId: category.id, subcategoryId: subcategory.id } : null;
    },
    async seed(configuration: readonly CategorySeed[]): Promise<void> {
      for (const category of configuration) {
        const record = { name: category.name, slug: dependencies.slugify(category.slug), order: category.order, isActive: category.isActive };
        const existing = await dependencies.categories.findBySlug(record.slug);
        const categoryId = existing
          ? (await dependencies.management.updateCategory({ id: existing.id, ...record })).id
          : (await dependencies.management.createCategory({ ...record, idempotencyKey: dependencies.newIdempotencyKey() })).record.id;
        for (const subcategory of category.subcategories) {
          const child = { name: subcategory.name, slug: dependencies.slugify(subcategory.slug), order: subcategory.order, isActive: subcategory.isActive };
          const prior = await dependencies.subcategories.findBySlug(categoryId, child.slug);
          if (prior) await dependencies.subcategories.update(categoryId, prior.id, child);
          else await dependencies.management.createSubcategory({ categoryId, ...child, idempotencyKey: dependencies.newIdempotencyKey() });
        }
      }
    },
  };
}
