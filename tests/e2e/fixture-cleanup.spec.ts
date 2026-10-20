import { expect, test } from "@playwright/test";

test("Falha ao salvar subcategoria remove a categoria criada pela fixture", async ({ browser }) => {
  const { createCategoryThroughApp } = await import("./_helpers/categories/createCategoryThroughApp");
  const { fixtureCategoryCatalog } = await import("./_helpers/categories/fixtureStore");
  const slug = `cleanup-${crypto.randomUUID()}`;
  await expect(createCategoryThroughApp(browser,
    { name: slug, slug, order: 1, isActive: true },
    { name: "Subcategoria inválida", slug: "", order: 1, isActive: true },
  )).rejects.toThrow();
  expect((await fixtureCategoryCatalog()).some(category => category.slug === slug)).toBe(false);
});
