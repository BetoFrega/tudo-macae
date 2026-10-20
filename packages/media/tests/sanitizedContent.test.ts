import { expect, test } from "vitest";
import { createSanitizedMediaContent } from "../sanitizedContent";
import type { Media } from "../model";

const digest = "b".repeat(64);
const media: Media = {
  id: "photo", status: "staged", revision: 2, digest,
  storagePath: `media-staged/sha256-${digest}.webp`, mimeType: "image/webp", createdAt: 1, updatedAt: 2,
  kind: "article-image", alt: "Ponte", caption: "", provenance: { origin: "own-production", displayBasis: "own-production", creator: "Ana", credit: "Ana", acquiredAt: 1 },
};

test("reads the immutable sanitized bytes after a metadata revision", async () => {
  const content = createSanitizedMediaContent({ digest: async () => digest, readMedia: async () => media, readBytes: async () => new Uint8Array([1, 2, 3]) });
  expect(await content.read("photo", digest)).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
});

test("refuses a changed digest and quarantine object without reading bytes", async () => {
  let reads = 0;
  const content = createSanitizedMediaContent({ digest: async () => digest, readMedia: async () => media, readBytes: async () => {
    reads += 1;
    return new Uint8Array([1]);
  } });
  expect(await content.read("photo", "c".repeat(64))).toBeNull();
  const quarantine = createSanitizedMediaContent({ digest: async () => digest, readMedia: async () => ({ ...media, storagePath: "quarantine/file" }), readBytes: async () => {
    reads += 1;
    return new Uint8Array([1]);
  } });
  expect(await quarantine.read("photo", digest)).toBeNull();
  expect(reads).toBe(0);
});

test("refuses bytes whose digest differs from the sanitized object identity", async () => {
  const dependencies = { readMedia: async () => media, readBytes: async () => new Uint8Array([1, 2, 3]), digest: async () => "c".repeat(64) };
  const content = createSanitizedMediaContent(dependencies);
  expect(await content.read("photo", digest)).toBeNull();
});
