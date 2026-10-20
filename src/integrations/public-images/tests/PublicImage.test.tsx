// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PublicImage } from "../PublicImage";
import { EditorialImage } from "../EditorialImage";
import { editorialLeadImageUrl } from "../editorial";
import { publicImagePresetWidths } from "@tudomacae/public-image-delivery/contract";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test("Hosted Profile avatars request variants through the application alias", () => {
  render(<PublicImage src="/api/classifieds/photos/public/profile-photos%2Fprofile%2Fphoto.webp" alt="Perfil Hosted" width={96} height={96} />);
  const image = screen.getByRole("img", { name: "Perfil Hosted" });
  expect(image.getAttribute("srcset")).toContain("/api/classifieds/photos/public/profile-photos%2Fprofile%2Fphoto.webp?w=96");
  expect(image.getAttribute("src")).not.toContain("/_next/image");
});

test.each([
  ["https://images.tudomacae.com.br", "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"],
  ["https://images.tudomacae.com.br/", "(min-width: 1024px) 66vw, (min-width: 768px) 50vw, 100vw"],
])("editorial images preserve responsive sizes and Worker candidates for origin %s", (origin, sizes) => {
  vi.stubEnv("NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN", origin);
  const src = editorialLeadImageUrl({ id: "photo", digest: "a".repeat(64) }, "/noticia/article/midias/photo");
  render(<EditorialImage src={src} alt="Orla de Macaé" width={1200} height={800} sizes={sizes} unoptimized />);
  const image = screen.getByRole("img", { name: "Orla de Macaé" });
  expect(image).toHaveAttribute("sizes", sizes);
  const candidates = image.getAttribute("srcset")?.split(", ") ?? [];
  expect(candidates.length).toBeGreaterThan(1);
  for (const candidate of candidates) {
    expect(candidate).toMatch(/ \d+w$/);
    const url = new URL(candidate.split(" ")[0]!);
    expect(url.origin).toBe(new URL(origin).origin);
    expect(url.pathname).toMatch(/^\/v1\/editorial\/hero\//);
    expect(publicImagePresetWidths.editorial.hero).toContain(Number(url.pathname.split("/")[4]));
  }
});

test("an ad photo route requests Worker variants while any other source renders as its original", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  const { rerender } = render(<PublicImage src="/api/anuncios/ad-1/fotos/photo" alt="Anúncio" width={320} height={240} />);
  const adImage = screen.getByRole("img", { name: "Anúncio" });
  expect(adImage.getAttribute("srcset")).toContain("/api/anuncios/ad-1/fotos/photo?w=");
  expect(adImage.getAttribute("srcset")).not.toContain("/_next/image");

  const src = "https://example.com/negocio.webp";
  rerender(<PublicImage src={src} alt="Negócio" width={96} height={96} />);
  const businessImage = screen.getByRole("img", { name: "Negócio" });
  expect(businessImage.getAttribute("src")).toBe(src);
  expect(businessImage.hasAttribute("srcset")).toBe(false);
});

test("forwards load failures to the caller", () => {
  const onError = vi.fn();
  render(<PublicImage src="/api/classifieds/photos/public/profile-photos%2Fp%2Fphoto.webp" alt="Perfil" width={64} height={64} onError={onError} />);
  fireEvent.error(screen.getByRole("img", { name: "Perfil" }));
  expect(onError).toHaveBeenCalledOnce();
});

test.each([33, 66])("editorial fallback uses the authorized route without responsive attributes for %svw", (desktopWidth) => {
  vi.stubEnv("NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
  render(<EditorialImage src="/noticia/article/midias/photo" alt="Mídia autorizada" width={960} height={640} sizes={`(min-width: 1024px) ${desktopWidth}vw, (min-width: 768px) 50vw, 100vw`} />);
  const image = screen.getByRole("img", { name: "Mídia autorizada" });
  expect(image.getAttribute("src")).toBe("/noticia/article/midias/photo");
  expect(image.hasAttribute("srcset")).toBe(false);
  expect(image.hasAttribute("sizes")).toBe(false);
});
