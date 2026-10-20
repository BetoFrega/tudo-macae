// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ArticleBodyRenderer } from "./ArticleBodyRenderer";

afterEach(cleanup);

describe("ArticleBodyRenderer", () => {
  test.each([
    "![media](media:portrait)\n\n![media](media:band)",
    "Veja [![media](media:portrait)](https://example.com) e **![media](media:band)**.",
  ])("renders each image as reading content without an enlargement control in %s", (body) => {
    render(
      <ArticleBodyRenderer
        body={body}
        media={[
          { id: "portrait", alt: "Cinco etapas de um projeto de lei", caption: "", credit: "", url: "/midia/portrait" },
          { id: "band", alt: "Mãos revisando um documento", caption: "", credit: "", url: "/midia/band" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Cinco etapas de um projeto de lei" })).toHaveAttribute("src", "/midia/portrait");
    expect(screen.getByRole("img", { name: "Mãos revisando um documento" })).toHaveAttribute("src", "/midia/band");
    expect(screen.queryByRole("link", { name: /Ampliar imagem/ })).toBeNull();
    expect(screen.queryByText("Ampliar imagem (abre em nova aba)")).toBeNull();
  });

  test("puts canonical metadata figure between Markdown paragraphs with valid flow markup", () => {
    const { container } = render(<ArticleBodyRenderer body={"Primeiro parágrafo.\n\n![media](media:media-1)\n\nSegundo parágrafo."} media={[{ id: "media-1", alt: "Ponte em Macaé", caption: "A ponte", credit: "Foto: Ana", url: "/noticia/a/midias/media-1" }]} />);
    expect(screen.getByRole("img", { name: "Ponte em Macaé" })).toHaveAttribute("src", "/noticia/a/midias/media-1");
    expect(screen.getByText("A ponte")).toBeInTheDocument();
    const credit = container.querySelector("[data-media-visual] [data-media-credit]");
    expect(credit).toHaveTextContent("Foto: Ana");
    expect(credit).not.toHaveAttribute("tabindex");
    expect(credit?.parentElement).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("img", { name: "Ponte em Macaé" }).closest("a, button")).toBeNull();
    expect(container.querySelector("figcaption")).not.toContainElement(credit as HTMLElement);
    expect(container.querySelector("p figure")).toBeNull();
    expect(container.querySelector("p img")).toBeNull();
    expect(screen.getByText("Primeiro parágrafo.").compareDocumentPosition(screen.getByRole("img", { name: "Ponte em Macaé" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("keeps external links safe and raw HTML inert around canonical media", () => {
    const { container } = render(<ArticleBodyRenderer body={"[Fonte](https://example.com)\n\n![media](media:media-1)\n\n<script>alert(1)</script>"} externalLinksInNewTab media={[{ id: "media-1", alt: "Macaé", caption: "", credit: "", url: "/midia/1" }]} />);
    expect(screen.getByRole("link", { name: "Fonte" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector("script")).toBeNull();
  });

  test("keeps GFM reference definitions and emphasis across an in-body figure", () => {
    render(<ArticleBodyRenderer body={"**Antes** [Fonte][ref]\n\n![media](media:media-1)\n\nDepois **em destaque**.\n\n[ref]: https://example.com/fonte"} externalLinksInNewTab media={[{ id: "media-1", alt: "Macaé", caption: "", credit: "", url: "/midia/1" }]} />);
    expect(screen.getByRole("link", { name: "Fonte" })).toHaveAttribute("href", "https://example.com/fonte");
    expect(screen.getByRole("link", { name: "Fonte" })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Antes").tagName).toBe("STRONG");
    expect(screen.getByText("em destaque").tagName).toBe("STRONG");
  });

  test("renders a canonical reference nested in a link without handing media: to the URL renderer", () => {
    const { container } = render(<ArticleBodyRenderer body="Veja [![media](media:media-1)](https://example.com) agora." externalLinksInNewTab media={[{ id: "media-1", alt: "Macaé", caption: "Vista do centro", credit: "Foto: Ana", url: "/midia/1" }]} />);
    const link = screen.getByRole("link", { name: "Macaé" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(link).getByRole("img", { name: "Macaé" })).toHaveAttribute("src", "/midia/1");
    expect(link).toHaveTextContent("Vista do centro");
    expect(container.querySelector("p img")?.getAttribute("src")).not.toBe("media:media-1");
    expect(container.querySelector("a a")).toBeNull();
    expect(link.querySelector("[data-media-visual]")).toHaveAttribute("tabindex", "-1");
    expect(link.querySelector("[data-media-visual] [data-media-credit]")).toHaveTextContent("Foto: Ana");
    expect(screen.queryByRole("link", { name: /Ampliar imagem/ })).toBeNull();
  });

  test("renders canonical references in headings accepted by the body parser", () => {
    render(<ArticleBodyRenderer body="## ![media](media:media-1)" media={[{ id: "media-1", alt: "Macaé", caption: "Vista do centro", credit: "Foto: Ana", url: "/midia/1" }]} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Macaé" });
    expect(within(heading).getByRole("img", { name: "Macaé" })).toHaveAttribute("src", "/midia/1");
    expect(heading).toHaveTextContent("Vista do centro");
    expect(screen.queryByRole("link", { name: /Ampliar imagem/ })).toBeNull();
    expect(heading).toHaveAccessibleName("Macaé");
  });

  test.each([
    "## Passos [![media](media:media-1)](https://example.com)",
    "## Passos [![media](media:media-1)][source]\n\n[source]: https://example.com",
    "## Passos **![media](media:media-1)**",
  ])("preserves heading content without adding enlargement controls in %s", (body) => {
    render(<ArticleBodyRenderer body={body} media={[{ id: "media-1", alt: "Cinco etapas", caption: "", credit: "", url: "/midia/1" }]} />);
    const heading = screen.getByRole("heading", { level: 2, name: "Passos Cinco etapas" });
    expect(within(heading).getByRole("img", { name: "Cinco etapas" })).toHaveAttribute("src", "/midia/1");
    expect(screen.queryByRole("link", { name: /Ampliar imagem/ })).toBeNull();
  });

  test("retains the signed embed URL without creating an enlargement action", () => {
    const expiredUrl = "/redacao/revisoes/submission/midias/media-1?expiresAt=1&signature=expired";
    render(<ArticleBodyRenderer body="![media](media:media-1)" media={[{ id: "media-1", alt: "Cinco etapas", caption: "", credit: "", url: expiredUrl }]} />);
    expect(screen.getByRole("img", { name: "Cinco etapas" })).toHaveAttribute("src", expiredUrl);
  });

  test.each([
    "## [![media](media:media-1)](https://example.com)",
    "[![media](media:media-1)][source]\n\n[source]: https://example.com",
    "| Imagem |\n| --- |\n| [![media](media:media-1)](https://example.com) |",
  ])("preserves authored links without generating enlargement links in %s", (body) => {
    const { container } = render(<ArticleBodyRenderer body={body} media={[{ id: "media-1", alt: "Macaé", caption: "", credit: "", url: "/midia/1" }]} />);
    expect(screen.getByRole("link", { name: "Macaé" })).toHaveAttribute("href", "https://example.com");
    expect(container.querySelector("a a")).toBeNull();
    expect(screen.queryByRole("link", { name: /Ampliar imagem/ })).toBeNull();
  });
});
