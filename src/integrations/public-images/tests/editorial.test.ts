import { afterEach, expect, test, vi } from "vitest";
import { editorialLeadImageUrl, editorialListingLeadImageUrl } from "../editorial";

afterEach(() => vi.unstubAllEnvs());
const media = { id: "photo", digest: "a".repeat(64) };
const fallback = "/noticia/article/midias/photo";

test("keeps established delivery until the editorial origin is configured", () => {
  vi.stubEnv("NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN", "");
  expect(editorialLeadImageUrl(media, fallback)).toBe(fallback);
});

test("uses one absolute versioned URL for all shared public uses", () => {
  vi.stubEnv("NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN", "https://images.tudomacae.com.br");
  expect(editorialLeadImageUrl(media, fallback)).toBe(`https://images.tudomacae.com.br/v1/editorial/hero/1200/editorial%2Fphoto%2F${media.digest}`);
  expect(editorialLeadImageUrl(media, "/noticia/other/midias/photo")).toBe(editorialLeadImageUrl(media, fallback));
  expect(editorialLeadImageUrl({ id: "legacy" }, fallback)).toBe(fallback);
});

test("listing images preserve legacy URLs and transform only receipt-backed publications", () => {
  vi.stubEnv("NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN", "https://images.tudomacae.com.br/");
  expect(editorialListingLeadImageUrl({}, media, fallback)).toBe(fallback);
  expect(editorialListingLeadImageUrl({ publicationReceiptId: "receipt" }, media, fallback)).toBe(editorialLeadImageUrl(media, fallback));
});
