import { expect, test } from "vitest";
import { adImageDirectoryPrefix, isAdImagePath } from "../imagePath";

test.each(["anuncio antigo", "negócio", "🏖️ 1"])("accepts only the owned historical raw directory for %s", (id) => {
  expect(isAdImagePath(id, `ad-images/${id}/photo.webp`)).toBe(true);
  expect(isAdImagePath(id, `${adImageDirectoryPrefix(id)}photo.webp`)).toBe(true);
  expect(isAdImagePath(id, `ad-images/${id}-other/photo.webp`)).toBe(false);
  expect(isAdImagePath(id, "ad-images/victim/photo.webp")).toBe(false);
  for (const suffix of ["", "../victim/photo.webp", "pending/../photo.webp", "/photo.webp", "%2e%2e/photo.webp", "%2Fvictim.webp", "bad name.webp", "folder\\photo.webp"]) {
    expect(isAdImagePath(id, `ad-images/${id}/${suffix}`)).toBe(false);
  }
});

test("the literal legacy id cannot own another ad's hashed directory", () => {
  const otherDirectory = adImageDirectoryPrefix("negócio");
  expect(isAdImagePath("_legacy", `${otherDirectory}photo.webp`)).toBe(false);
  expect(isAdImagePath("_legacy", "ad-images/_legacy/photo.webp")).toBe(true);
  expect(isAdImagePath("_legacy", "ad-images/_legacy/pending/photo.webp")).toBe(true);
});
