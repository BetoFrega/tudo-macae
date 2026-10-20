// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityAvatar, type IdentityImage } from "../presentation";

const TestImage: IdentityImage = ({ onError, onLoad, ...props }) => (
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- The native element exposes real image load dimensions to the readiness handler.
  <img {...props} onError={onError} onLoad={onLoad} />
);

function avatar(src?: string) {
  return (
    <IdentityAvatar
      Image={TestImage}
      alt="Mercado do Centro"
      className="size-16 rounded-xl"
      fallbackClassName="rounded-xl bg-muted"
      fallback={<span>Sem foto</span>}
      height={64}
      {...(src !== undefined ? { src } : {})}
      width={64}
    />
  );
}

function setImageDimensions(image: HTMLImageElement, naturalWidth: number) {
  Object.defineProperty(image, "complete", { configurable: true, value: true });
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: naturalWidth });
}

function fireSuccessfulLoad(image: HTMLImageElement) {
  setImageDimensions(image, 64);
  fireEvent.load(image);
}

describe("IdentityAvatar", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the explicit fallback without mounting an image when there is no photo", () => {
    render(avatar());

    expect(screen.getByText("Sem foto")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps the image mounted but hidden from assistive technology until it loads", () => {
    const { container } = render(avatar("https://images.example.test/business.webp"));
    const image = container.querySelector("img") as HTMLImageElement;

    expect(screen.getByText("Sem foto")).toBeVisible();
    expect(screen.queryByRole("img", { name: "Mercado do Centro" })).not.toBeInTheDocument();
    fireEvent.error(image);

    expect(image).toBeInTheDocument();
    expect(screen.getByText("Sem foto")).toBeVisible();
    expect(screen.queryByRole("img", { name: "Mercado do Centro" })).not.toBeInTheDocument();
  });

  it("removes fallback only after a complete image has positive natural width", () => {
    const { container } = render(avatar("https://images.example.test/business.webp"));
    const image = container.querySelector("img") as HTMLImageElement;

    setImageDimensions(image, 0);
    fireEvent.load(image);
    expect(screen.getByText("Sem foto")).toBeVisible();

    fireSuccessfulLoad(image);
    expect(screen.queryByText("Sem foto")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mercado do Centro" })).toBe(image);
  });

  it("resets readiness on source change and ignores a late event from the old image", () => {
    const { container, rerender } = render(avatar("https://images.example.test/first.webp"));
    const firstImage = container.querySelector("img") as HTMLImageElement;
    fireSuccessfulLoad(firstImage);
    expect(screen.queryByText("Sem foto")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mercado do Centro" })).toBe(firstImage);

    rerender(avatar("https://images.example.test/second.webp"));
    const secondImage = container.querySelector("img") as HTMLImageElement;
    expect(secondImage).not.toBe(firstImage);
    expect(screen.getByText("Sem foto")).toBeVisible();
    expect(screen.queryByRole("img", { name: "Mercado do Centro" })).not.toBeInTheDocument();

    act(() => fireSuccessfulLoad(firstImage));
    expect(screen.getByText("Sem foto")).toBeVisible();
  });

  it("renders the same loading fallback before and during client hydration", async () => {
    const element = avatar("https://images.example.test/cached.webp");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);

    expect(container.querySelector("img[alt='Mercado do Centro']")).not.toBeNull();
    expect(container.textContent).toContain("Sem foto");

    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(container.textContent).toContain("Sem foto");
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/hydration|server rendered/i), expect.anything());
    await act(async () => root!.unmount());
  });
});
