// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TaxonomyAdListing } from "./TaxonomyAdListing";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const path = "/categoria/category-id/veiculos";
const listing = (adPage: Parameters<typeof TaxonomyAdListing>[0]["adPage"], cursor?: string | string[]) => (
  <TaxonomyAdListing headingId="category-ads-title" scopeName="Veículos" path={path} adPage={adPage} cursor={cursor} categories={[]} compactEmptyState={true} />
);

test("a rejected continuation offers the first page in place of the listing", () => {
  render(listing({ items: [], invalidCursor: true }, "broken"));

  expect(screen.getByRole("heading", { level: 2, name: "Anúncios de Veículos" })).toBeVisible();
  const recovery = screen.getByRole("status");
  expect(recovery).toHaveTextContent("Esta página de anúncios é inválida. Volte à primeira página para continuar.");
  expect(screen.getByRole("link", { name: "Primeira página de anúncios" })).toHaveAttribute("href", `${path}#anuncios`);
  expect(screen.queryByRole("navigation", { name: "Páginas de anúncios" })).not.toBeInTheDocument();
});

test("following recovery from a repeated continuation lands keyboard focus on the first page's ads heading", () => {
  const view = render(listing({ items: [], invalidCursor: true }, ["one", "two"]));
  screen.getByRole("link", { name: "Primeira página de anúncios" }).focus();

  window.location.hash = "anuncios";
  view.rerender(listing({ items: [], nextCursor: "next" }));

  expect(screen.getByRole("heading", { level: 2, name: "Anúncios de Veículos" })).toHaveFocus();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mais anúncios" })).toHaveAttribute("href", `${path}?adCursor=next#anuncios`);
});
