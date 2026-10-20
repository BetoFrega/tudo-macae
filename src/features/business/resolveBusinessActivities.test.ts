import { expect, test } from "vitest";
import { resolveBusinessActivities } from "./resolveBusinessActivities";

test("resolves active category context and attributes the return path to the business page", () => {
  expect(resolveBusinessActivities(
    [{ categoryId: "services", subcategoryId: "maintenance" }],
    [{
      id: "services",
      name: "Serviços",
      slug: "servicos",
      order: 1,
      isActive: true,
      subcategories: [{
        id: "maintenance",
        name: "Manutenção",
        slug: "manutencao",
        order: 1,
        isActive: true,
      }],
    }],
  )).toEqual([{
    categoryId: "services",
    subcategoryId: "maintenance",
    categoryName: "Serviços",
    subcategoryName: "Manutenção",
    href: "/negocios?categoria=services&subcategoria=maintenance&origem=business_profile",
  }]);
});
