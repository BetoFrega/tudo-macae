// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./JsonLd";

describe("JsonLd", () => {
  it.each([
    "Título </script><p data-outside-jsonld>texto literal</p>",
    "Descrição </ScRiPt ><p data-outside-jsonld>texto literal</p>",
    "Comentário <!--<script>texto literal",
    "Macaé & café: < 3, > 1, \"aspas\", 'apóstrofo', \\barra e\nlinha\u2028separador\u2029parágrafo",
  ])("keeps %s inside structured data when the HTML is parsed", (text) => {
    const data = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": text,
      "description": text,
      "image": [`https://example.test/foto?q=${text}`],
      "datePublished": "2026-08-20T17:30:00.000Z",
    };
    const document = new DOMParser().parseFromString(renderToStaticMarkup(<JsonLd data={data} />), "text/html");
    expect(document.querySelector("[data-outside-jsonld]")).toBeNull();
    expect(document.querySelectorAll("script")).toHaveLength(1);
    expect(JSON.parse(document.querySelector("script")!.textContent!)).toEqual(data);
  });
});
