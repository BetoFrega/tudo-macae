// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Category } from "@tudomacae/categories/model";
import type { BusinessPublicData } from "@tudomacae/advertiser-identity/business";
import { CategoryBusinessPreview } from "./CategoryBusinessPreview";

const categories: Category[] = [
  {
    id: "food",
    name: "Restaurantes",
    slug: "restaurantes",
    order: 0,
    isActive: true,
    subcategories: [
      {
        id: "snacks",
        name: "Lanches",
        slug: "lanches",
        order: 0,
        isActive: true,
      },
      {
        id: "meals",
        name: "Refeições",
        slug: "refeicoes",
        order: 1,
        isActive: true,
      },
    ],
  },
  {
    id: "services",
    name: "Serviços",
    slug: "servicos",
    order: 1,
    isActive: true,
    subcategories: [{
      id: "repairs",
      name: "Reparos",
      slug: "reparos",
      order: 0,
      isActive: true,
    }],
  },
];

const business: BusinessPublicData = {
  id: "restaurant",
  title: "Café & Restaurante Macaense",
  contacts: [{ number: "22999999999", isWhatsapp: true }],
  activityAreas: [
    { categoryId: "food", subcategoryId: "snacks" },
    { categoryId: "food", subcategoryId: "meals" },
    { categoryId: "services", subcategoryId: "repairs" },
  ],
};

test("shows each business once with only the current category activities", () => {
  render(
    <CategoryBusinessPreview
      category={categories[0]}
      categories={categories}
      businesses={[business]}
    />,
  );

  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Café & Restaurante Macaense" }))
    .toHaveAttribute("href", "/negocio/restaurant/cafe-restaurante-macaense");
  expect(screen.getByRole("link", { name: "Restaurantes: Lanches" }))
    .toBeVisible();
  expect(screen.getByRole("link", { name: "Restaurantes: Refeições" }))
    .toBeVisible();
  expect(screen.queryByRole("link", { name: "Serviços: Reparos" }))
    .not.toBeInTheDocument();
  expect(screen.getByRole("link", {
    name: "Ver todos os negócios de Restaurantes",
  })).toHaveAttribute(
    "href",
    "/negocios?categoria=food&origem=category",
  );
});

test("keeps the category section without linking to an empty catalog", () => {
  render(
    <CategoryBusinessPreview
      category={categories[0]}
      categories={categories}
      businesses={[]}
    />,
  );

  expect(screen.getByRole("region", { name: "Negócios de Restaurantes" }))
    .toHaveAttribute("id", "negocios");
  expect(screen.getByText("Ainda não há negócios nesta categoria."))
    .toBeVisible();
  expect(screen.queryByRole("link", {
    name: "Ver todos os negócios de Restaurantes",
  })).not.toBeInTheDocument();
});
