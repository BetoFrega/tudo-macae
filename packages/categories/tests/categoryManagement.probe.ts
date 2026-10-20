import type * as entry from "@tudomacae/categories/categoryManagement";

export async function run(module: typeof entry) {
  const category = { id: "category-1", name: "Serviços", slug: "servicos", order: -0.5, isActive: true };
  const subcategory = { id: "subcategory-1", categoryId: category.id, name: "Aulas", slug: "aulas", order: 0.25, isActive: true };
  const store: entry.CategoryManagementStore = {
    async listCategories() { return { items: [category] }; },
    async listSubcategories() { return { items: [subcategory] }; },
    async createCategory() { return { status: "created", record: category }; },
    async createSubcategory() { return { status: "created", record: subcategory }; },
    async updateCategory(input) { return { status: "updated", record: input }; },
  };
  const management = module.createCategoryManagement({ store, slugify: value => value.toLowerCase(), isSupportedIcon: () => true });

  await management.listCategories({});
  await management.listSubcategories({ categoryId: category.id });
  await management.createCategory({ name: category.name, isActive: true, order: category.order, idempotencyKey: "category-key" });
  await management.createSubcategory({ categoryId: category.id, name: subcategory.name, isActive: true, order: subcategory.order, idempotencyKey: "subcategory-key" });
  await management.updateCategory(category);
}
