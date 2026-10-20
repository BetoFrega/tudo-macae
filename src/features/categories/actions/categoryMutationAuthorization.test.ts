import { describe, expect, it, vi } from "vitest";
import { authorizeCategoryManagement } from "./authorizeCategoryManagement";
import { createCategory } from "./createCategory";
import { createSubcategory } from "./createSubcategory";
import { deleteCategory } from "./deleteCategory";
import { deleteSubcategory } from "./deleteSubcategory";
import { seedCategories } from "./seedCategories";
import { updateCategory } from "./updateCategory";
import { updateSubcategory } from "./updateSubcategory";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./authorizeCategoryManagement", () => ({
  authorizeCategoryManagement: vi.fn(),
}));

const input = {
  id: "category-1",
  categoryId: "category-1",
  subcategoryId: "subcategory-1",
  name: "Category",
  slug: "category",
  order: 0,
  isActive: true,
};

describe("category mutation authorization", () => {
  it.each([
    ["createCategory", () => createCategory(input)],
    ["updateCategory", () => updateCategory(input)],
    ["deleteCategory", () => deleteCategory(input)],
    ["createSubcategory", () => createSubcategory(input)],
    ["updateSubcategory", () => updateSubcategory(input)],
    ["deleteSubcategory", () => deleteSubcategory(input)],
    ["seedCategories", () => seedCategories()],
  ])("stops %s before its mutation when authorization fails", async (_, action) => {
    const authorizationError = new Error("authorization failed");
    vi.mocked(authorizeCategoryManagement).mockRejectedValueOnce(authorizationError);

    await expect(action()).rejects.toBe(authorizationError);
  });
});
