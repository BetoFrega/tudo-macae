// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PRODUCT_SCHEMA_MARKER, renderProductMarkdown } from "./sync-product-md.mjs";

const text = (plain_text: string, annotations = {}, href: string | null = null) =>
  ({ plain_text, annotations, href });
const block = (type: string, ...rich_text: ReturnType<typeof text>[]) =>
  ({ type, [type]: { rich_text } });

describe("renderProductMarkdown", () => {
  it("emits the Impeccable schema and the page sections up to the first divider", () => {
    const markdown = renderProductMarkdown([
      block("callout", text("Fonte para regenerar o PRODUCT.md")),
      block("heading_2", text("Platform")),
      block("paragraph", text("web")),
      block("heading_2", text("Product Principles")),
      block("bulleted_list_item", text("Publicar "), text("nunca", { bold: true }), text(" exige dinheiro.")),
      block("bulleted_list_item", text("Domínio "), text("www.tudomacae.com.br", { code: true })),
      block("paragraph", text("Fim.")),
      { type: "divider", divider: {} },
      block("heading_2", text("Autoridade e vigência")),
    ]);

    expect(markdown).toBe([
      "# Product",
      "",
      PRODUCT_SCHEMA_MARKER,
      "",
      "## Platform",
      "",
      "web",
      "",
      "## Product Principles",
      "",
      "- Publicar **nunca** exige dinheiro.",
      "- Domínio `www.tudomacae.com.br`",
      "",
      "Fim.",
      "",
    ].join("\n"));
  });

  it("numbers ordered items and keeps external links", () => {
    const markdown = renderProductMarkdown([
      block("numbered_list_item", text("Um")),
      block("numbered_list_item", text("WCAG", {}, "https://www.w3.org/TR/WCAG22/")),
    ]);

    expect(markdown).toContain("1. Um\n2. [WCAG](https://www.w3.org/TR/WCAG22/)\n");
  });

  it("refuses a block it cannot render instead of dropping its content", () => {
    expect(() => renderProductMarkdown([block("toggle", text("x"))])).toThrow("toggle");
  });
});
