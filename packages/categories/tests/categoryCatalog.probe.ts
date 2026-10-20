import type * as entry from "@tudomacae/categories/categoryCatalog";

export async function run(module: typeof entry) {
  const catalog = module.createCategoryCatalog({
    listCategories: async () => ({ items: [{ id: "category", name: "Category", slug: "category", order: 1, isActive: true }] }),
    listSubcategories: async ({ categoryId }) => ({ items: [{ id: "subcategory", categoryId, name: "Subcategory", slug: "subcategory", order: 1, isActive: true }] }),
  });
  await catalog.list();
}
