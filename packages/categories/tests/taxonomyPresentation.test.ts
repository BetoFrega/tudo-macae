import { expect, test } from "vitest";
import type { Category } from "@tudomacae/categories/model";
import { firstDiscoveryLayer, orderBusinessTaxonomy } from "@tudomacae/categories/taxonomyPresentation";

test("orders business taxonomy by override, shared fallback, then identity without mutating shared order", () => {
  const categories: Category[] = [
    { id: "b", name: "B", slug: "b", order: 0, businessOrder: 2, isActive: true, subcategories: [
      { id: "z", name: "Z", slug: "z", order: 0, businessOrder: 2, isActive: true },
      { id: "a", name: "A", slug: "a", order: 1, isActive: true },
    ] },
    { id: "c", name: "C", slug: "c", order: 1, isActive: true, subcategories: [] },
    { id: "a", name: "A", slug: "a", order: 1, isActive: true, subcategories: [] },
  ];
  const sorted = orderBusinessTaxonomy(categories);
  expect(sorted.map(category => category.id)).toEqual(["a", "c", "b"]);
  expect(sorted[2]?.subcategories.map(subcategory => subcategory.id)).toEqual(["a", "z"]);
  expect(categories.map(category => category.id)).toEqual(["b", "c", "a"]);
  expect(categories[0]?.subcategories.map(subcategory => subcategory.id)).toEqual(["z", "a"]);
});

test.each([
  [undefined, true, true, "ads"],
  ["businesses", true, true, "businesses"],
  ["ads", false, true, "businesses"],
  ["businesses", true, false, "ads"],
  [undefined, false, false, "businesses"],
] as const)("resolves preferred layer %s with ads=%s and businesses=%s", (preferred, ads, businesses, expected) => {
  expect(firstDiscoveryLayer(preferred, ads, businesses)).toBe(expected);
});
