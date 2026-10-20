import { strict as assert } from "node:assert";
import type { createSubcategoryLifecycle } from "@tudomacae/categories/subcategoryLifecycle";

export async function run(module: {
  createSubcategoryLifecycle: typeof createSubcategoryLifecycle;
}) {
  let active = true;
  let associated = true;
  let exists = true;
  const lifecycle = module.createSubcategoryLifecycle({
    subcategories: {
      async deactivateIfPresent() {
        active = false;
      },
      async delete() {
        exists = false;
      },
    },
    activityAreas: {
      async removeAll() {
        associated = false;
      },
    },
  });

  await lifecycle.delete({ categoryId: "category", subcategoryId: "subcategory" });
  assert.equal(active, false);
  assert.equal(associated, false);
  assert.equal(exists, false);
}
