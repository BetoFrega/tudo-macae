import { describe, expect, test, vi } from "vitest";
import { createCategoryManagement, type CategoryManagementStore } from "@tudomacae/categories/categoryManagement";

const category = { id: "category-1", name: "Serviços", slug: "servicos", order: -1.5, isActive: true };
const subcategory = { id: "subcategory-1", categoryId: category.id, name: "Aulas", slug: "aulas", order: 0.5, isActive: true };

function setup(overrides: Partial<CategoryManagementStore> = {}) {
  const store: CategoryManagementStore = {
    listCategories: vi.fn(async () => ({ items: [category] })),
    listSubcategories: vi.fn(async () => ({ items: [subcategory] })),
    createCategory: vi.fn(async () => ({ status: "created" as const, record: category })),
    createSubcategory: vi.fn(async () => ({ status: "created" as const, record: subcategory })),
    updateCategory: vi.fn(async input => ({ status: "updated" as const, record: input })),
    ...overrides,
  };
  return { store, management: createCategoryManagement({
    store,
    slugify: value => value.trim().toLowerCase().replaceAll(" ", "-"),
    isSupportedIcon: name => name === "house",
  }) };
}

describe("Category management", () => {
  test("normalizes creation and accepts negative and fractional ranks", async () => {
    const { store, management } = setup();
    await management.createCategory({ name: " Serviços ", slug: " SERVIÇOS ", order: -1.5, isActive: true, icon: "house", idempotencyKey: " key " });
    expect(store.createCategory).toHaveBeenCalledWith({ name: "Serviços", slug: "serviços", order: -1.5, isActive: true, icon: "house", idempotencyKey: "key" });
  });

  test("derives a slug and keeps an active child under any parent state", async () => {
    const { store, management } = setup();
    await management.createSubcategory({ categoryId: "category-1", name: "Aulas Particulares", order: 0.5, isActive: true, idempotencyKey: "sub-key" });
    expect(store.createSubcategory).toHaveBeenCalledWith({ categoryId: "category-1", name: "Aulas Particulares", slug: "aulas-particulares", order: 0.5, isActive: true, idempotencyKey: "sub-key" });
  });

  test("rejects non-finite ranks and unsupported icons", async () => {
    const { management } = setup();
    await expect(management.createCategory({ name: "X", order: Number.POSITIVE_INFINITY, isActive: true, idempotencyKey: "x" })).rejects.toThrow();
    await expect(management.createCategory({ name: "X", icon: "invented", isActive: true, idempotencyKey: "x" })).rejects.toEqual(expect.objectContaining({ code: "validationFailed" }));
    await expect(management.createCategory({ name: "X", businessOrder: Number.NaN, isActive: true, idempotencyKey: "x" })).rejects.toThrow();
    await expect(management.createCategory({ name: "X", preferredLayer: "unknown", isActive: true, idempotencyKey: "x" })).rejects.toThrow();
  });

  test("updates a category through the canonical contract", async () => {
    const { store, management } = setup();
    await expect(management.updateCategory({
      id: category.id,
      name: " Serviços locais ",
      slug: " SERVIÇOS LOCAIS ",
      order: -0.25,
      isActive: false,
      icon: "house",
    })).resolves.toEqual({
      id: category.id,
      name: "Serviços locais",
      slug: "serviços-locais",
      order: -0.25,
      isActive: false,
      icon: "house",
    });
    expect(store.updateCategory).toHaveBeenCalledWith({
      id: category.id,
      name: "Serviços locais",
      slug: "serviços-locais",
      order: -0.25,
      isActive: false,
      icon: "house",
    });
  });

  test("passes optional editorial settings through create and update", async () => {
    const { store, management } = setup();
    await management.createCategory({ name: "Serviços", isActive: true, businessOrder: -2, preferredLayer: "businesses", idempotencyKey: "new" });
    expect(store.createCategory).toHaveBeenCalledWith(expect.objectContaining({ businessOrder: -2, preferredLayer: "businesses" }));
    await management.createSubcategory({ categoryId: category.id, name: "Aulas", isActive: true, businessOrder: 1.5, idempotencyKey: "child" });
    expect(store.createSubcategory).toHaveBeenCalledWith(expect.objectContaining({ businessOrder: 1.5 }));
    await management.updateCategory({ ...category, businessOrder: 0, preferredLayer: "ads" });
    expect(store.updateCategory).toHaveBeenCalledWith(expect.objectContaining({ businessOrder: 0, preferredLayer: "ads" }));
  });

  test.each([
    ["notFound", "notFound"],
    ["duplicate", "duplicate"],
  ] as const)("translates an update %s result", async (status, code) => {
    const { management } = setup({ updateCategory: vi.fn(async () => ({ status })) });
    await expect(management.updateCategory({
      id: category.id, name: category.name, slug: category.slug, order: category.order, isActive: category.isActive,
    })).rejects.toEqual(expect.objectContaining({ code }));
  });

  test("rejects an unsupported icon before updating", async () => {
    const { management } = setup();
    await expect(management.updateCategory({
      id: category.id, name: category.name, slug: category.slug, order: category.order, isActive: category.isActive, icon: "invented",
    })).rejects.toEqual(expect.objectContaining({ code: "validationFailed" }));
  });

  test("treats a blank administrative icon as absent", async () => {
    const { store, management } = setup();
    await management.updateCategory({
      id: category.id, name: category.name, slug: category.slug, order: category.order, isActive: category.isActive, icon: " ",
    });
    expect(store.updateCategory).toHaveBeenCalledWith(category);
  });

  test.each([
    ["duplicate", "duplicate"],
    ["idempotencyConflict", "conflict"],
    ["parentNotFound", "notFound"],
    ["parentDeleting", "conflict"],
  ] as const)("maps %s without leaking persistence", async (status, code) => {
    const { management } = setup({ createSubcategory: vi.fn(async () => ({ status })) });
    await expect(management.createSubcategory({ categoryId: "category-1", name: "Aulas", isActive: true, idempotencyKey: "key" }))
      .rejects.toEqual(expect.objectContaining({ code }));
  });
});
