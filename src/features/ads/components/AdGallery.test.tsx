// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AdGallery } from "./AdGallery";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("requests gallery and thumbnail candidates from the ad photo route", () => {
  vi.stubEnv("NODE_ENV", "production");
  const source = (id: string) =>
    `/api/anuncios/ad-1/fotos/${id}`;

  render(
    <AdGallery
      title="Bicicleta"
      images={[
        { id: "front", path: "ad-images/ad-1/front.webp", order: 0, url: source("front") },
        { id: "side", path: "ad-images/ad-1/side.webp", order: 1, url: source("side") },
      ]}
    />,
  );

  expect(screen.getByRole("img", { name: "Bicicleta" }).getAttribute("srcset"))
    .toContain("/api/anuncios/ad-1/fotos/front?w=");
  expect(screen.getByRole("img", { name: "Foto 1" }).getAttribute("srcset"))
    .toContain("/api/anuncios/ad-1/fotos/front?w=");
});
