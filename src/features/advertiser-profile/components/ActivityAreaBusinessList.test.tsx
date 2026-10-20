// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ActivityAreaBusinessList } from "./ActivityAreaBusinessList";

test("keeps an anchored, compact business section when the area is empty", async () => {
  render(await ActivityAreaBusinessList({
    categoryId: "services",
    subcategoryId: "repairs",
    subcategoryName: "Reparos",
    businesses: [],
  }));

  expect(screen.getByRole("region", { name: "Negócios da subcategoria Reparos" }))
    .toHaveAttribute("id", "negocios");
  expect(screen.getByText("Ainda não há negócios publicados nesta subcategoria."))
    .toBeVisible();
  expect(screen.queryByRole("link", { name: "Ver todos os negócios" }))
    .not.toBeInTheDocument();
});
