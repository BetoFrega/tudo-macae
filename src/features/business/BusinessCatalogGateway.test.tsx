// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { Category } from "@tudomacae/categories/model";
import { BusinessCatalogGateway } from "./BusinessCatalogGateway";

const categories: Category[] = [{
  id: "food",
  name: "Alimentação",
  slug: "alimentacao",
  order: 0,
  isActive: true,
  subcategories: [
    { id: "snacks", name: "Lanches", slug: "lanches", order: 0, isActive: true },
    { id: "hidden", name: "Oculta", slug: "oculta", order: 1, isActive: false },
  ],
}, {
  id: "inactive",
  name: "Inativa",
  slug: "inativa",
  order: 1,
  isActive: false,
  subcategories: [{ id: "child", name: "Filha", slug: "filha", order: 0, isActive: true }],
}];

test("reveals only active category links", async () => {
  const user = userEvent.setup();
  render(<BusinessCatalogGateway categories={categories} source="home" />);

  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Explore por categoria" })).toBeInTheDocument();
  expect(screen.getByText("Lanches")).not.toBeVisible();
  expect(screen.getByRole("link", { name: "Alimentação" })).toHaveAttribute(
    "href",
    "/categoria/food/alimentacao",
  );
  await user.click(screen.getByRole("button", { name: "Mostrar subcategorias de Alimentação" }));
  expect(screen.getByRole("link", { name: /Lanches/u })).toHaveAttribute(
    "href",
    "/negocios?categoria=food&subcategoria=snacks&origem=home#business-results-title",
  );
  expect(screen.queryByText("Oculta")).not.toBeInTheDocument();
  expect(screen.queryByText("Inativa")).not.toBeInTheDocument();
});

test("opens the selected category from the catalog URL", () => {
  render(
    <BusinessCatalogGateway
      categories={categories}
      source="catalog"
      initialCategoryId="food"
    />,
  );

  expect(screen.getByRole("link", { name: /Lanches/u })).toBeVisible();
  expect(screen.getByRole("link", { name: /Lanches/u })).toHaveAttribute(
    "href",
    "/negocios?categoria=food&subcategoria=snacks&origem=catalog#business-results-title",
  );
});
