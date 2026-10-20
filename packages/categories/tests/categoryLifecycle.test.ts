import { expect, test } from "vitest";
import { createCategoryLifecycle } from "@tudomacae/categories/categoryLifecycle";

test("retains the category and unprocessed subcategories after partial deletion and permits retry", async () => {
  const remaining = new Set(["first", "second"]);
  let categoryExists = true;
  let deleting = false;
  let fail = true;
  const lifecycle = createCategoryLifecycle({
    categories: {
      async beginDeletion() { deleting = true; },
      async listSubcategories(id) {
        return [...remaining].map(subcategoryId => ({ categoryId: id, subcategoryId }));
      },
      async delete() { categoryExists = false; },
    },
    subcategories: {
      async delete(area) {
        if (area.subcategoryId === "second" && fail) throw new Error("cleanup interrupted");
        remaining.delete(area.subcategoryId);
      },
    },
  });
  await expect(lifecycle.delete({ id: "category" })).rejects.toThrow("cleanup interrupted");
  expect(deleting).toBe(true);
  expect(categoryExists).toBe(true);
  expect([...remaining]).toEqual(["second"]);
  fail = false;
  await lifecycle.delete({ id: "category" });
  await lifecycle.delete({ id: "category" });
  expect(categoryExists).toBe(false);
  expect([...remaining]).toEqual([]);
});
