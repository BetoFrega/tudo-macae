// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { Category } from "@tudomacae/categories/model";
import { HomepageCategoryNav } from "./HomepageCategoryNav";

const category: Category = {
  id: "services", name: "Serviços", slug: "servicos", order: 1, isActive: true,
  subcategories: [
    { id: "repairs", name: "Reparos", slug: "reparos", order: 1, isActive: true },
    { id: "hidden", name: "Oculta", slug: "oculta", order: 2, isActive: false },
  ],
};

test("opens a category to reveal working category and active subcategory links", async () => {
  const user = userEvent.setup();
  render(<HomepageCategoryNav categories={[category]} />);
  expect(screen.getByText("Reparos")).not.toBeVisible();

  await user.click(screen.getByText("Serviços"));

  expect(screen.getByRole("navigation", {
    name: "Categorias de negócios e anúncios",
  })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ver tudo em Serviços" })).toHaveAttribute("href", "/categoria/services/servicos");
  expect(screen.getByRole("link", { name: "Reparos" })).toHaveAttribute("href", "/categoria/services/servicos/repairs/reparos");
  expect(screen.queryByText("Oculta")).not.toBeInTheDocument();
});

test("does not render a navigation region when no category is active", () => {
  render(<HomepageCategoryNav categories={[{ ...category, isActive: false }]} />);
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
