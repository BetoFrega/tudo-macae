// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AreaNavigation } from "./area-navigation";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/redacao" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

const items = [
  { href: "/redacao", label: "Redação" },
  { href: "/redacao/clientes", label: "Clientes" },
  { href: "/redacao/atividades", label: "Atividades" },
];

describe("AreaNavigation", () => {
  beforeEach(() => {
    pathname.value = "/redacao";
  });

  test("marks only the exact destination as current", () => {
    render(<AreaNavigation items={items} label="Navegação da Redação" />);

    expect(screen.getByRole("navigation", { name: "Navegação da Redação" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Redação" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Clientes" }))
      .not.toHaveAttribute("aria-current");
  });

  test("keeps the parent destination current on a nested page", () => {
    pathname.value = "/redacao/clientes/client-1";
    render(<AreaNavigation items={items} />);

    expect(screen.getByRole("link", { name: "Clientes" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Redação" }))
      .not.toHaveAttribute("aria-current");
  });

  test("does not mark a similarly prefixed destination as current", () => {
    pathname.value = "/redacao-clientes";
    render(<AreaNavigation items={items} />);

    for (const item of items) {
      expect(screen.getByRole("link", { name: item.label }))
        .toHaveAttribute("href", item.href);
    }
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });
});
