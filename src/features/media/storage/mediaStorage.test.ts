import { describe, expect, test } from "vitest";
import { getMediaPreviewUrl } from "./mediaStorage";

describe("cached Media previews", () => {
  test("keeps a production preview usable for the lifetime of cached metadata", async () => {
    await expect(getMediaPreviewUrl({
      id: "media/one",
      kind: "article-image",
      status: "staged",
      revision: 1,
      alt: "Orla dos Cavaleiros",
      caption: "",
      provenance: {
        origin: "own-production",
        creator: "Maria Souza",
        credit: "Foto: Maria Souza/Tudo Macaé",
        displayBasis: "own-production",
        acquiredAt: 1_777_000_000_000,
      },
      storagePath: "media-staged/orla.webp",
      mimeType: "image/webp",
      createdAt: 1_777_000_000_000,
      updatedAt: 1_777_000_000_000,
    })).resolves.toBe("/midia/media%2Fone");
  });
});
