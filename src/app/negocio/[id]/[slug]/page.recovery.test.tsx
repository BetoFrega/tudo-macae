// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { BusinessAds } from "./page";

test("a rejected continuation offers the business's first page in place of its ads", () => {
  render(<BusinessAds adPage={{ items: [], invalidCursor: true }} cursor="broken" canonicalPath="/negocio/business-id/cafe-com-arte" categories={[]} firstActivity={undefined} />);

  expect(screen.getByRole("heading", { level: 2, name: "Anúncios deste negócio" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Esta página de anúncios é inválida. Volte à primeira página para continuar.");
  expect(screen.getByRole("link", { name: "Primeira página de anúncios" })).toHaveAttribute("href", "/negocio/business-id/cafe-com-arte#anuncios");
  expect(screen.queryByRole("navigation", { name: "Páginas de anúncios" })).not.toBeInTheDocument();
});
