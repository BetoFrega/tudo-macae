import { strict as assert } from "node:assert";
import type { createCategoryLifecycle } from "@tudomacae/categories/categoryLifecycle";

export async function run(module: { createCategoryLifecycle: typeof createCategoryLifecycle }) {
  const remaining = new Set(["first", "second"]);
  let categoryExists = true;
  const lifecycle = module.createCategoryLifecycle({
    categories: {
      async beginDeletion() {},
      async listSubcategories(id) {
        return [...remaining].map(subcategoryId => ({ categoryId: id, subcategoryId }));
      },
      async delete() { categoryExists = false; },
    },
    subcategories: {
      async delete(area) { remaining.delete(area.subcategoryId); },
    },
  });
  await lifecycle.delete({ id: "category" });
  assert.equal(categoryExists, false);
  assert.equal(remaining.size, 0);
}
