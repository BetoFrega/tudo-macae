// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilteredAdEmptyState } from "./FilteredAdList";

describe("FilteredAdEmptyState", () => {
  it("orients visitors and offers a clear path to publish", () => {
    render(<FilteredAdEmptyState scopeName="Empregos" />);

    expect(
      screen.getByRole("heading", {
        name: "Você chegou antes dos anúncios",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ainda não há anúncios de Empregos. Seu anúncio pode abrir esta vitrine local.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Publicar meu anúncio" }),
    ).toHaveAttribute("href", "/publicar");
    expect(
      screen.getByText("A publicação básica é gratuita."),
    ).toBeInTheDocument();
  });
});
