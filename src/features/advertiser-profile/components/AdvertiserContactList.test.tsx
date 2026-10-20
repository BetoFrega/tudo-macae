// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AdvertiserContactList } from "./AdvertiserContactList";

describe("AdvertiserContactList", () => {
  const emptyState = "Este negócio ainda não informou um telefone para contato.";
  const sourcePath = "/anuncio/ad-1/bicicleta";

  it("renders an explicit empty state when no contacts are provided", () => {
    render(<AdvertiserContactList sourcePath={sourcePath} />);

    expect(screen.getByText(emptyState)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an explicit empty state when contacts array is empty", () => {
    render(<AdvertiserContactList contacts={[]} sourcePath={sourcePath} />);

    expect(screen.getByText(emptyState)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not render the empty state when there are contacts", () => {
    render(<AdvertiserContactList contacts={[{ number: "22999999999", isWhatsapp: true }]} sourcePath={sourcePath} />);

    expect(screen.queryByText(emptyState)).not.toBeInTheDocument();
  });

  it("renders whatsapp contact correctly", () => {
    const contacts = [{ number: "22999999999", isWhatsapp: true }];
    render(<AdvertiserContactList contacts={contacts} sourcePath={sourcePath} />);

    const link = screen.getByRole("link");
    const url = new URL(link.getAttribute("href")!);
    expect(url.origin + url.pathname).toBe("https://wa.me/5522999999999");
    expect(url.searchParams.get("text")).toBe(
      "Olá! Encontrei seu telefone no Tudo Macaé: https://www.tudomacae.com.br/anuncio/ad-1/bicicleta",
    );
    expect(screen.getByText("(22) 99999-9999")).toBeInTheDocument();
  });

  it("renders non-whatsapp contact correctly", () => {
    const contacts = [{ number: "22888888888", isWhatsapp: false }];
    render(<AdvertiserContactList contacts={contacts} sourcePath={sourcePath} />);

    // Check if the number is displayed but no link
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "tel:22888888888");
    expect(screen.getByText("(22) 88888-8888")).toBeInTheDocument();
  });

  it("renders multiple contacts", () => {
    const contacts = [
      { number: "22999999999", isWhatsapp: true },
      { number: "22888888888", isWhatsapp: false },
    ];
    render(<AdvertiserContactList contacts={contacts} sourcePath={sourcePath} />);

    expect(screen.getAllByText(/\(\d{2}\) \d{4,5}-\d{4}/)).toHaveLength(2);
  });
});
