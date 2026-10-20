import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/termos-e-condicoes" }));

import RootLayout from "./layout";

test("server rendering composes document navigation, brand, fonts and secondary blog", () => {
  const html = renderToStaticMarkup(<RootLayout><h1>Termos</h1></RootLayout>);
  expect(html).toContain("lang=\"pt-BR\"");
  expect(html).toMatch(/class="\s*geist-sans geist-mono\s+antialiased\s*"/u);
  expect(html).toContain("alt=\"Tudo Macaé\"");
  expect(html).toContain("href=\"/noticias\"");
  expect(html).not.toContain("href=\"/editoria/");
  expect(html).toContain("href=\"/minha-conta/anuncios\"");
  expect(html).toContain("href=\"/termos-e-condicoes\"");
  expect(html).toContain("href=\"/politica-de-privacidade\"");
  expect(html).toContain("<main id=\"conteudo\"><h1>Termos</h1></main>");
});
