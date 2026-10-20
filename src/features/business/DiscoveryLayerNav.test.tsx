// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DiscoveryLayerNav } from "./DiscoveryLayerNav";

test("announces businesses and ads as sibling sections", () => {
  render(<DiscoveryLayerNav scopeName="Serviços" />);

  const navigation = screen.getByRole("navigation", {
    name: "Conteúdo de Serviços",
  });
  expect(navigation).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ir para Negócios" }))
    .toHaveAttribute("href", "#negocios");
  expect(screen.getByRole("link", { name: "Ir para Anúncios" }))
    .toHaveAttribute("href", "#anuncios");
  expect(screen.getByText("Negócios locais, contatos e áreas de atuação")).toBeInTheDocument();
  expect(screen.getByText("Produtos, serviços e oportunidades publicados")).toBeInTheDocument();
});
