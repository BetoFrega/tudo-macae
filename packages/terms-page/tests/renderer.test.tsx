// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MarkdownRenderer from "../MarkdownRenderer";

describe("MarkdownRenderer", () => {
  afterEach(cleanup);

  it("preserves ordinary Markdown without interpreting raw HTML", () => {
    const { container } = render(
      <MarkdownRenderer content={`## Serviço

Texto com **ênfase**.

- Primeiro
- Segundo

<script>alert(1)</script>`}
      />,
    );

    expect(screen.getByRole("heading", { name: "Serviço", level: 2 })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("ênfase").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders Markdown tables with headers, alignment and inline formatting", () => {
    render(
      <MarkdownRenderer content={`| Local | Vagas |
| :--- | ---: |
| **Centro** | 12 |
| [Praia](https://example.com) | 8 |`}
      />,
    );

    const table = screen.getByRole("table");
    expect(screen.getByRole("region", { name: "Tabela" })).toContainElement(table);
    expect(screen.getByRole("region", { name: "Tabela" })).toHaveAttribute("tabindex", "0");
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent))
      .toEqual(["Local", "Vagas"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("cell", { name: "12" })).toHaveStyle({ textAlign: "right" });
    expect(within(table).getByText("Centro").tagName).toBe("STRONG");
    expect(within(table).getByRole("link", { name: "Praia" }))
      .toHaveAttribute("href", "https://example.com");
  });

  it("opens external article links in a new tab and keeps internal links in the same tab", () => {
    render(
      <MarkdownRenderer
        content="[Fonte](https://example.com/fonte) [Outra fonte](//example.org/fonte) [Outra matéria](/noticia/123/outra)"
        externalLinksInNewTab
      />,
    );

    for (const name of ["Fonte", "Outra fonte"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("target", "_blank");
      expect(screen.getByRole("link", { name })).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(screen.getByRole("link", { name: "Outra matéria" })).not.toHaveAttribute("target");
  });
});
