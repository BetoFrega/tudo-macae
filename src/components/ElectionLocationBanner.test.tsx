// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ElectionLocationBanner } from "./ElectionLocationBanner";

describe("ElectionLocationBanner", () => {
  it("offers the Macaé voting-location map through a named region and a native link", () => {
    render(<ElectionLocationBanner />);
    const region = screen.getByRole("region", { name: "Guia de locais de votação" });
    expect(region).toBeVisible();
    expect(screen.getByRole("link", { name: "Eleições 2026 · Locais de votação em Macaé · Ver mapa e endereços" }))
      .toHaveAttribute("href", "https://comochegar.eleicoes2026.tudomacae.com.br/");
  });
});
