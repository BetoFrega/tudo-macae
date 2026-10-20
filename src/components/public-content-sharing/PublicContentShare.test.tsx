// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PublicContentShare } from "./PublicContentShare";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
});

describe("PublicContentShare", () => {
  test("offers a WhatsApp message for a published Article", () => {
    render(
      <PublicContentShare
        content={{
          kind: "article",
          id: "article-1",
          title: "Macaé recebe nova iluminação",
          canonicalPath: "/noticia/article-1/macae-recebe-nova-iluminacao",
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Compartilhar no WhatsApp" });
    const url = new URL(link.getAttribute("href")!);

    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(
      "Macaé recebe nova iluminação — leia no Tudo Macaé\n"
      + "https://www.tudomacae.com.br/noticia/article-1/macae-recebe-nova-iluminacao?utm_source=whatsapp&utm_medium=share",
    );
    fireEvent.click(link);
    expect(mocks.capture).toHaveBeenCalledWith("content_share_initiated", {
      content_kind: "article",
      content_id: "article-1",
      share_method: "whatsapp",
    });
  });

  test("opens the native share sheet when the browser supports it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const user = userEvent.setup();

    render(
      <PublicContentShare
        content={{
          kind: "article",
          id: "article-1",
          title: "Macaé recebe nova iluminação",
          canonicalPath: "/noticia/article-1/macae-recebe-nova-iluminacao?origem=home#trecho",
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Compartilhar" }));

    expect(share).toHaveBeenCalledWith({
      title: "Macaé recebe nova iluminação",
      text: "Macaé recebe nova iluminação — leia no Tudo Macaé",
      url: "https://www.tudomacae.com.br/noticia/article-1/macae-recebe-nova-iluminacao?utm_source=native_share&utm_medium=share",
    });
    expect(mocks.capture).toHaveBeenCalledWith("content_share_initiated", {
      content_kind: "article",
      content_id: "article-1",
      share_method: "native_share",
    });
  });

  test("copies an attributed link when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <PublicContentShare
        content={{
          kind: "ad",
          id: "ad-1",
          title: "Bicicleta azul",
          canonicalPath: "/anuncio/ad-1/bicicleta-azul?origem=home",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copiar link" }));

    expect(writeText).toHaveBeenCalledWith(
      "https://www.tudomacae.com.br/anuncio/ad-1/bicicleta-azul?utm_source=copy_link&utm_medium=share",
    );
    expect(mocks.capture).toHaveBeenCalledWith("content_share_initiated", {
      content_kind: "ad",
      content_id: "ad-1",
      share_method: "copy_link",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Link copiado.");
    const whatsapp = new URL(
      screen.getByRole("link", { name: "Compartilhar no WhatsApp" }).getAttribute("href")!,
    );
    expect(whatsapp.searchParams.get("text")).toBe(
      "Olha este anúncio no Tudo Macaé: Bicicleta azul\n"
      + "https://www.tudomacae.com.br/anuncio/ad-1/bicicleta-azul?utm_source=whatsapp&utm_medium=share",
    );
  });

  test("offers link copying after the native share sheet fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("unavailable"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const user = userEvent.setup();

    render(
      <PublicContentShare
        content={{
          kind: "ad",
          id: "ad-1",
          title: "Bicicleta azul",
          canonicalPath: "/anuncio/ad-1/bicicleta-azul",
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Compartilhar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível abrir as opções de compartilhamento.",
    );
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
  });

  test("keeps cancellation of the native share sheet neutral", async () => {
    const share = vi.fn().mockRejectedValue(
      new DOMException("The user canceled the share", "AbortError"),
    );
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const user = userEvent.setup();

    render(
      <PublicContentShare
        content={{
          kind: "article",
          id: "article-1",
          title: "Macaé recebe nova iluminação",
          canonicalPath: "/noticia/article-1/macae-recebe-nova-iluminacao",
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Compartilhar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compartilhar" })).toBeInTheDocument();
  });

  test("reports a copy failure when both clipboard strategies fail", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    render(
      <PublicContentShare
        content={{
          kind: "article",
          id: "article-1",
          title: "Macaé recebe nova iluminação",
          canonicalPath: "/noticia/article-1/macae-recebe-nova-iluminacao",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copiar link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível copiar o link.",
    );
  });

  test("keeps sharing available when analytics fails", async () => {
    mocks.capture.mockImplementationOnce(() => {
      throw new Error("analytics unavailable");
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <PublicContentShare
        content={{
          kind: "ad",
          id: "ad-1",
          title: "Bicicleta azul",
          canonicalPath: "/anuncio/ad-1/bicicleta-azul",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copiar link" }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("Link copiado.");
  });
});
