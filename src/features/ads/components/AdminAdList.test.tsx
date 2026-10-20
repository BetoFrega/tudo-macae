// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { AdminAdList } from "./AdminAdList";

const ads = [
  {
    id: "active-ad",
    title: "Anúncio ativo",
    slug: "anuncio-ativo",
    text: "Ativo",
    status: "active" as const,
    createdAt: Date.UTC(2026, 9, 8),
    categoryName: "Empregos",
    subcategoryName: "Vagas",
  },
  {
    id: "paused-ad",
    title: "Anúncio pausado",
    slug: "anuncio-pausado",
    text: "Pausado",
    status: "paused" as const,
    createdAt: Date.UTC(2026, 9, 8),
    categoryName: "Serviços",
    subcategoryName: "Reparos",
  },
];

describe("AdminAdList", () => {
  test("expõe o filtro selecionado e anuncia a quantidade exibida", async () => {
    render(<AdminAdList ads={ads} />);

    const filters = screen.getByRole("group", { name: "Filtrar anúncios" });
    expect(filters).toContainElement(screen.getByRole("button", { name: /^Todos/ }));

    expect(screen.getByRole("button", { name: /^Todos/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 anúncios exibidos");

    await userEvent.click(screen.getByRole("button", { name: /^Ativos/ }));

    expect(screen.getByRole("button", { name: /^Ativos/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 anúncio exibido");
    expect(screen.getByText("Anúncio ativo")).toBeInTheDocument();
    expect(screen.queryByText("Anúncio pausado")).not.toBeInTheDocument();
  });
});
