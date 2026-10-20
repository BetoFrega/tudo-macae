import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import TermsPage, { metadata } from "./page";

describe("Terms Workers page", () => {
  test("renders the shared legal content and canonical metadata", () => {
    const html = renderToStaticMarkup(<TermsPage />);
    expect(html).toContain("Termos de Uso e Condições Gerais");
    expect(html).toContain("<h1");
    expect(html).toContain("id=\"terms-content\"");
    expect(metadata.alternates).toEqual({ canonical: "/termos-e-condicoes" });
    expect(metadata.other).toEqual({ search_result_type: "page" });
  });
});
