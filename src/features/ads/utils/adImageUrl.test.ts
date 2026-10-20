import { expect, test } from "vitest";
import { adImageDirectoryPrefix } from "@tudomacae/ads/imagePath";
import { getAdImageUrl } from "./adImageUrl";

test("routes legacy private pending photos through the gated endpoint", () => {
  const adId = "publicação antiga 2026";
  const id = "00000000-0000-4000-8000-000000000001";
  expect(getAdImageUrl(adId, {
    id, path: `${adImageDirectoryPrefix(adId)}pending/${id}.png`, order: 0,
  })).toBe(`/api/anuncios/${encodeURIComponent(adId)}/fotos/${id}`);
});

test("keeps the Worker URL and routes a published photo without one through the same endpoint", () => {
  const image = { id: "foto 1", path: "ad-images/ad-1/foto.webp", order: 0 };
  expect(getAdImageUrl("ad-1", { ...image, url: "/api/anuncios/ad-1/fotos/worker" })).toBe("/api/anuncios/ad-1/fotos/worker");
  expect(getAdImageUrl("ad-1", image)).toBe("/api/anuncios/ad-1/fotos/foto%201");
  expect(getAdImageUrl("ad-1", { ...image, url: "" })).toBe("/api/anuncios/ad-1/fotos/foto%201");
});
