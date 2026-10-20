import { expect, test } from "vitest";
import type { Category } from "@tudomacae/categories/model";
import { filterBusinessCatalogCategories } from "./filterBusinessCatalogCategories";

const categories: Category[] = [{
  id: "food",
  name: "Alimentação",
  slug: "alimentacao",
  order: 0,
  isActive: true,
  subcategories: [
    { id: "meals", name: "Refeições", slug: "refeicoes", order: 0, isActive: true },
    { id: "sweets", name: "Doces", slug: "doces", order: 1, isActive: true },
  ],
}, {
  id: "empty",
  name: "Sem negócios",
  slug: "sem-negocios",
  order: 1,
  isActive: true,
  subcategories: [{ id: "none", name: "Vazia", slug: "vazia", order: 0, isActive: true }],
}];

test("keeps only taxonomy nodes represented by public businesses", () => {
  expect(filterBusinessCatalogCategories(categories, [{
    categoryId: "food",
    subcategoryId: "meals",
  }])).toEqual([{
    ...categories[0],
    subcategories: [categories[0]!.subcategories[0]],
  }]);
});

test("orders represented business taxonomy without changing shared taxonomy", () => {
  const shared: Category[] = [
    { id: "first", name: "Primeira", slug: "primeira", order: 0, businessOrder: 2,
      isActive: true, subcategories: [
        { id: "a", name: "A", slug: "a", order: 0, businessOrder: 2, isActive: true },
        { id: "b", name: "B", slug: "b", order: 1, businessOrder: 0, isActive: true },
      ] },
    { id: "second", name: "Segunda", slug: "segunda", order: 1, businessOrder: 0,
      isActive: true, subcategories: [
        { id: "c", name: "C", slug: "c", order: 0, isActive: true },
      ] },
  ];
  const areas = [
    { categoryId: "first", subcategoryId: "a" },
    { categoryId: "first", subcategoryId: "b" },
    { categoryId: "second", subcategoryId: "c" },
  ];

  const catalog = filterBusinessCatalogCategories(shared, areas);
  expect(catalog.map(category => category.id)).toEqual(["second", "first"]);
  expect(catalog[1]?.subcategories.map(subcategory => subcategory.id)).toEqual(["b", "a"]);
  expect(shared.map(category => category.id)).toEqual(["first", "second"]);
  expect(shared[0]?.subcategories.map(subcategory => subcategory.id)).toEqual(["a", "b"]);
});
