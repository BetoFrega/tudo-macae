// @vitest-environment jsdom
/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- Portable figure tests supply native image children. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MediaFigure } from "@tudomacae/media/figure";

test("makes a standalone image credit reachable by keyboard", async () => {
  const user = userEvent.setup();
  render(
    <MediaFigure credit="Foto: Joana">
      <img src="/ponte.webp" alt="Ponte azul" width={960} height={640} />
    </MediaFigure>,
  );
  await user.tab();
  expect(screen.getByRole("img").closest("[data-media-visual]")).toHaveFocus();
});

test("uses the enclosing link's keyboard focus without adding a nested tab stop", async () => {
  const user = userEvent.setup();
  render(
    <>
      <a href="/noticia/ponte" aria-label="Ler notícia da ponte">
        <MediaFigure credit="Foto: Joana" creditFocusable={false}>
          <img src="/ponte.webp" alt="Ponte azul" width={960} height={640} />
        </MediaFigure>
      </a>
      <a href="/noticias">Todas as notícias</a>
    </>,
  );
  await user.tab();
  expect(screen.getByRole("link", { name: "Ler notícia da ponte" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("link", { name: "Todas as notícias" })).toHaveFocus();
});

test.each([true, false])("dismisses the credit with Escape and reveals it on renewed focus (standalone: %s)", async (standalone) => {
  const user = userEvent.setup();
  const figure = <MediaFigure credit="Foto: Joana" creditFocusable={standalone}><img src="/ponte.webp" alt="Ponte azul" /></MediaFigure>;
  const { container } = render(
    <>
      {standalone ? figure : <a href="/noticia/ponte">{figure}</a>}
      <button>Próximo</button>
    </>,
  );
  await user.tab();
  await user.keyboard("{Escape}");
  expect(container.querySelector("[data-media-visual]")).toHaveAttribute("data-credit-dismissed", "true");
  await user.tab();
  await user.tab({ shift: true });
  expect(container.querySelector("[data-media-visual]")).not.toHaveAttribute("data-credit-dismissed");
});

test("reveals a linked image credit on first touch and activates on second touch", async () => {
  const user = userEvent.setup();
  const activate = vi.fn();
  const figure = <MediaFigure credit="Foto: Joana" creditFocusable={false}><img src="/ponte.webp" alt="Ponte azul" /></MediaFigure>;
  render(<a href="#ponte" onClick={activate}>{figure}</a>);
  const image = screen.getByRole("img", { name: "Ponte azul" });
  await user.pointer({ keys: "[TouchA]", target: image });
  expect(image.closest("[data-media-visual]")).toHaveFocus();
  expect(activate).not.toHaveBeenCalled();
  await user.pointer({ keys: "[TouchA]", target: image });
  expect(activate).toHaveBeenCalledOnce();
});

test("keeps accessible description, editorial caption and attribution separate", () => {
  const { container } = render(
    <MediaFigure caption="A ponte foi reaberta nesta manhã." credit="Foto: Ana">
      <img src="/ponte.webp" alt="Pessoas atravessam uma ponte de estrutura azul" width={960} height={640} />
    </MediaFigure>,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName("Pessoas atravessam uma ponte de estrutura azul");
  expect(container.querySelector("figcaption")).toHaveTextContent(/^A ponte foi reaberta nesta manhã\.$/);
  expect(container.querySelector("[data-media-visual] [data-media-credit]")).toHaveTextContent("Foto: Ana");
  expect(screen.queryByText("Pessoas atravessam uma ponte de estrutura azul")).not.toBeInTheDocument();
});

test("places the body attribution after the caption without an image overlay or keyboard stop", async () => {
  const user = userEvent.setup();
  const { container } = render(
    <>
      <MediaFigure caption="Etapas do processo." credit="Arte: Tudo Macaé" creditPlacement="below">
        <img src="/etapas.webp" alt="Cinco etapas de um processo" width={1122} height={1402} />
      </MediaFigure>
      <a href="/etapas.webp">Ampliar imagem</a>
    </>,
  );
  expect(container.querySelector("[data-media-visual] [data-media-credit]")).toBeNull();
  expect(container.querySelector("[data-media-caption]")).toHaveTextContent(/^Etapas do processo\.$/);
  expect(container.querySelector("figure")?.lastElementChild).toBe(container.querySelector("figcaption"));
  expect(container.querySelector("figcaption [data-media-credit]")).toHaveTextContent("Arte: Tudo Macaé");
  expect(screen.getByText("Arte: Tudo Macaé").compareDocumentPosition(screen.getByText("Etapas do processo.")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  await user.tab();
  expect(screen.getByRole("link", { name: "Ampliar imagem" })).toHaveFocus();
});

test.each([undefined, "", "  "])("does not invent a caption from alt or credit when caption is %s", (caption) => {
  const { container } = render(
    <MediaFigure caption={caption} credit="Foto: Ana">
      <img src="/ponte.webp" alt="Estrutura azul da ponte" width={960} height={640} />
    </MediaFigure>,
  );
  expect(container.querySelector("figcaption")).toBeNull();
  expect(container.querySelector("[data-media-credit]")).toHaveTextContent("Foto: Ana");
  expect(screen.queryByText("Estrutura azul da ponte")).not.toBeInTheDocument();
});

test("preserves a caption without inventing attribution and allows decorative alt", () => {
  const { container } = render(
    <MediaFigure caption="Legenda editorial preservada.">
      <img src="/decoracao.webp" alt="" width={960} height={640} />
    </MediaFigure>,
  );
  expect(container.querySelector("figcaption")).toHaveTextContent("Legenda editorial preservada.");
  expect(container.querySelector("[data-media-credit]")).toBeNull();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("preserves one-touch media selection through an enclosing button", async () => {
  const user = userEvent.setup();
  const activate = vi.fn();
  render(<button onClick={activate}><MediaFigure credit="Foto: Joana" creditFocusable={false}><img src="/ponte.webp" alt="Ponte azul" /></MediaFigure></button>);
  await user.pointer({ keys: "[TouchA]", target: screen.getByRole("img", { name: "Ponte azul" }) });
  expect(activate).toHaveBeenCalledOnce();
});
