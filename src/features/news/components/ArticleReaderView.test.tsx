// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { ArticleReaderContent } from "@tudomacae/editorial-blog/articleReader";
import { ArticleReaderView } from "./ArticleReaderView";

afterEach(cleanup);

const content: ArticleReaderContent = {
  title: "Uma notícia local", body: "Texto da matéria.", path: "/noticia/exemplo/uma-noticia-local",
  editorName: "Editora local", assisted: true,
  sources: [{ name: "Fonte local", url: "https://example.com/fonte" }], media: [],
};

test("keeps authorship at the top and discloses AI assistance after the sources and corrections", () => {
  const { container } = render(<ArticleReaderView content={{ ...content, corrections: [{ createdAt: 1, summary: "Horário corrigido." }] }} mediaUrls={{}} />);
  const editor = screen.getByText(/Editor responsável:/);
  const disclosure = screen.getByRole("region", { name: "Transparência editorial" });
  const sources = screen.getByRole("region", { name: "Fontes da Matéria" });
  expect(editor).not.toHaveTextContent("assistência de IA");
  expect(disclosure).toHaveTextContent("Produzida com assistência de IA e revisão humana.");
  expect(editor.compareDocumentPosition(screen.getByText("Texto da matéria.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(sources.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("region", { name: "Retificações" }).compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.firstElementChild?.lastElementChild).toBe(disclosure);
  expect(screen.getByRole("link", { name: "Fonte local" })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: "Fonte local" })).toHaveAttribute("rel", "noopener noreferrer");
});

test("does not claim AI assistance for a human-authored article", () => {
  render(<ArticleReaderView content={{ ...content, assisted: false }} mediaUrls={{}} />);
  expect(screen.queryByRole("region", { name: "Transparência editorial" })).not.toBeInTheDocument();
  expect(screen.getByText(/Editor responsável:/)).toHaveTextContent("Editora local");
});

test("preserves absent legacy authorship and an unlinked source", () => {
  const legacyContent: ArticleReaderContent = {
    title: "Uma notícia antiga",
    body: "Texto preservado.",
    path: "/noticia/exemplo/uma-noticia-antiga",
    sources: [{ name: "Fonte sem endereço" }],
    media: [],
  };

  render(<ArticleReaderView content={legacyContent} mediaUrls={{}} />);

  expect(screen.queryByText(/Editor responsável:/)).not.toBeInTheDocument();
  expect(screen.getByText("Fonte sem endereço").closest("a")).toBeNull();
});

test("distinguishes an unknown original source date from its consultation time", () => {
  render(
    <ArticleReaderView
      content={{
        ...content,
        sources: [{
          name: "Fonte local",
          url: "https://example.com/fonte",
          reportedAt: null,
          accessedAt: Date.parse("2026-09-10T15:00:00Z"),
        }],
      }}
      mediaUrls={{}}
    />,
  );

  expect(screen.getByText(
    "Data original não informada pela fonte · Consultada em: 10/09/2026 12:00",
  )).toBeVisible();
});

test("shows the publication time supplied by the published receipt", () => {
  render(<ArticleReaderView content={content} mediaUrls={{}} publishedAt={Date.parse("2026-09-10T15:00:00Z")} />);
  const timestamp = screen.getByTestId("news-article-published-at");
  expect(timestamp).toHaveTextContent("Publicada em 10/09/2026 12:00");
  expect(timestamp.querySelector("time")).toHaveAttribute("datetime", "2026-09-10T15:00:00.000Z");
});

test("does not invent a publication date in the unpublished review preview", () => {
  render(<ArticleReaderView content={content} mediaUrls={{}} />);
  expect(screen.queryByTestId("news-article-published-at")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Compartilhar conteúdo" }))
    .not.toBeInTheDocument();
});

test("offers sharing after the metadata of a published article", () => {
  render(
    <ArticleReaderView
      content={content}
      mediaUrls={{}}
      publishedAt={Date.parse("2026-09-10T15:00:00Z")}
      sharing={{ id: "article-1", canonicalPath: content.path }}
    />,
  );

  const metadata = screen.getByTestId("news-article-published-at").parentElement!;
  const sharing = screen.getByRole("region", { name: "Compartilhar conteúdo" });
  expect(metadata.compareDocumentPosition(sharing) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();
  const whatsapp = new URL(
    screen.getByRole("link", { name: "Compartilhar no WhatsApp" }).getAttribute("href")!,
  );
  expect(whatsapp.searchParams.get("text")).toContain("utm_source=whatsapp");
});

test("distinguishes the original publication time from the latest update", () => {
  render(
    <ArticleReaderView
      content={content}
      mediaUrls={{}}
      publishedAt={Date.parse("2026-09-10T15:00:00Z")}
      updatedAt={Date.parse("2026-09-11T16:00:00Z")}
    />,
  );
  expect(screen.getByTestId("news-article-published-at"))
    .toHaveTextContent("Publicada em 10/09/2026 12:00");
  expect(screen.getByTestId("news-article-updated-at"))
    .toHaveTextContent("Atualizada em 11/09/2026 13:00");
});

test("keeps every caption beside its image and credit inside the visual, independently of AI disclosure", () => {
  const media = [
    { id: "hero", alt: "Mapa principal", caption: "Legenda principal", credit: "Tudo Macaé", generated: true },
    { id: "illustration", alt: "Mãos com mapa", caption: "Legenda interna", credit: "Crédito da ilustração", generated: true },
    { id: "photo", alt: "Praça central", caption: "Legenda da foto", credit: "Foto: Ana", generated: false },
    { id: "unknown", alt: "Imagem antiga", caption: "", credit: "Acervo" },
  ];
  const { container } = render(<ArticleReaderView content={{ ...content, media }} mediaUrls={Object.fromEntries(media.map(item => [item.id, `/media/${item.id}.webp`]))} />);
  expect(Array.from(container.querySelectorAll("figcaption"), caption => caption.textContent))
    .toEqual(["Legenda principal", "Legenda interna", "Legenda da foto"]);
  for (const item of media) {
    const figure = screen.getByRole("img", { name: item.alt }).closest("figure");
    expect(figure?.querySelector("[data-media-visual] [data-media-credit]")).toHaveTextContent(item.credit);
    expect(figure).not.toHaveTextContent(item.alt);
  }
  const disclosure = screen.getByRole("region", { name: "Transparência editorial" });
  expect(disclosure).toHaveTextContent("Produzida com assistência de IA e revisão humana.");
  expect(disclosure).toHaveTextContent("Esta Matéria utiliza imagens geradas por IA.");
  expect(disclosure).not.toHaveTextContent("Legenda interna");
  expect(disclosure).not.toHaveTextContent("Crédito da ilustração");
});

test("uses only an explicit lead in the header while retaining canonical inline media in the body", () => {
  const media = [
    { id: "inline", alt: "Imagem no corpo", caption: "Legenda no corpo", credit: "Foto: Ana" },
    { id: "lead", alt: "Imagem principal", caption: "Legenda principal", credit: "Foto: Bia" },
  ];
  const { container } = render(<ArticleReaderView content={{ ...content, body: "Antes.\n\n![media](media:inline)\n\nDepois.", media, leadMediaId: "lead" }} mediaUrls={{ inline: "/inline.webp", lead: "/lead.webp" }} />);
  const figures = Array.from(container.querySelectorAll("figure"));
  expect(figures).toHaveLength(2);
  expect(figures[0]?.querySelector("img")).toHaveAttribute("alt", "Imagem principal");
  expect(figures[1]?.querySelector("img")).toHaveAttribute("alt", "Imagem no corpo");
  expect(figures[1]?.querySelector("figcaption")).toHaveTextContent("Legenda no corpo");
});

test("does not promote an inline image when the explicit lead is empty", () => {
  const media = [{ id: "inline", alt: "Imagem no corpo", caption: "", credit: "Foto: Ana" }];
  const { container } = render(<ArticleReaderView content={{ ...content, body: "![media](media:inline)", media, leadMediaId: null }} mediaUrls={{ inline: "/inline.webp" }} />);
  expect(container.querySelectorAll("header figure")).toHaveLength(0);
  expect(screen.getByRole("img", { name: "Imagem no corpo" })).toBeInTheDocument();
});

test("keeps every legacy header image before the body without promoting its inline image", () => {
  const media = [
    { id: "old-1", alt: "Imagem antiga um", caption: "", credit: "Acervo" },
    { id: "old-2", alt: "Imagem antiga dois", caption: "", credit: "Acervo" },
    { id: "inline", alt: "Imagem inline nova", caption: "", credit: "Foto: Ana" },
  ];
  const { container } = render(
    <ArticleReaderView
      content={{
        ...content,
        body: "Texto.\n\n![media](media:inline)",
        media,
        legacyHeaderMediaIds: ["old-1", "old-2"],
      }}
      mediaUrls={{ "old-1": "/old-1.webp", "old-2": "/old-2.webp", "inline": "/inline.webp" }}
    />,
  );
  const figures = Array.from(container.querySelectorAll("figure"));
  expect(figures.slice(0, 2).map(figure => figure.querySelector("img")?.getAttribute("alt")))
    .toEqual(["Imagem antiga um", "Imagem antiga dois"]);
  const inlineFigure = screen.getByRole("img", { name: "Imagem inline nova" }).closest("figure")!;
  expect(figures[1]?.compareDocumentPosition(inlineFigure) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();
  expect(figures).toHaveLength(3);
});

test("identifies a generated hero without claiming that human-authored article text used AI", () => {
  render(
    <ArticleReaderView
      content={{ ...content, assisted: false, media: [
        { id: "hero", alt: "Praça", caption: "", credit: "Tudo Macaé / IA", generated: true },
      ] }}
      mediaUrls={{ hero: "/media/hero.webp" }}
    />,
  );
  const disclosure = screen.getByRole("region", { name: "Transparência editorial" });
  expect(disclosure).toHaveTextContent("Esta Matéria utiliza imagens geradas por IA.");
  expect(disclosure).not.toHaveTextContent("Produzida com assistência de IA");
  expect(screen.getByRole("img", { name: "Praça" }).closest("figure")?.querySelector("figcaption")).toBeNull();
});
