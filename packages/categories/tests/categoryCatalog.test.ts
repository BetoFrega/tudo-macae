import { describe, expect, test, vi } from "vitest";
import { CategoryManagementError, createCategoryCatalog } from "@tudomacae/categories/categoryCatalog";

const first = { id: "first", name: "Primeira", slug: "primeira", order: 1, isActive: true };
const second = { id: "second", name: "Segunda", slug: "segunda", order: 2, isActive: true };

function createCatalog(overrides: Partial<Parameters<typeof createCategoryCatalog>[0]> = {}) {
  const listCategories = vi.fn(async () => ({ items: [first, second] }));
  const listSubcategories = vi.fn(async ({ categoryId }: { categoryId: string }) => ({
    items: [{ id: `${categoryId}-child`, categoryId, name: "Filha", slug: "filha", order: 0, isActive: true }],
  }));
  return {
    catalog: createCategoryCatalog({ listCategories, listSubcategories, ...overrides }),
    listCategories,
    listSubcategories,
  };
}

describe("createCategoryCatalog", () => {
  test("omits only the parent that disappears after the category snapshot", async () => {
    const { catalog } = createCatalog({
      listSubcategories: async ({ categoryId }) => {
        if (categoryId === first.id) throw new CategoryManagementError("notFound", "Categoria não encontrada.");
        return { items: [{ id: "child", categoryId, name: "Filha", slug: "filha", order: 0, isActive: true }] };
      },
    });
    await expect(catalog.list()).resolves.toEqual([{
      ...second,
      subcategories: [{ id: "child", name: "Filha", slug: "filha", order: 0, isActive: true }],
    }]);
  });

  test.each([
    ["provider", new Error("provider unavailable")],
    ["permission", Object.assign(new Error("denied"), { code: "permission-denied" })],
    ["unexpected TypeError", new TypeError("Categoria não encontrada.")],
    ["other category error", new CategoryManagementError("duplicate", "duplicate")],
  ])("propagates %s failures", async (_label, error) => {
    const { catalog } = createCatalog({
      listSubcategories: async () => {
        throw error;
      },
    });
    await expect(catalog.list()).rejects.toBe(error);
  });

  test("preserves parent and child pagination", async () => {
    const listCategories = vi.fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: "parent-cursor" })
      .mockResolvedValueOnce({ items: [second] });
    const listSubcategories = vi.fn(({ categoryId, cursor }: { categoryId: string; cursor?: string }) => categoryId === first.id && !cursor
      ? Promise.resolve({ items: [{ id: "child-1", categoryId, name: "Filha 1", slug: "filha-1", order: 0, isActive: true }], nextCursor: "child-cursor" })
      : Promise.resolve({ items: [{ id: "child-2", categoryId, name: "Filha 2", slug: "filha-2", order: 0, isActive: true }] }));
    const catalog = createCategoryCatalog({ listCategories, listSubcategories });

    await expect(catalog.list()).resolves.toHaveLength(2);
    expect(listCategories).toHaveBeenNthCalledWith(2, { limit: 50, cursor: "parent-cursor" });
    expect(listSubcategories).toHaveBeenCalledWith({ categoryId: first.id, limit: 50, cursor: "child-cursor" });
  });
});
