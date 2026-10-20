import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createOpenGraph,
  createSocialDescription,
  DEFAULT_SOCIAL_IMAGE,
} from "./socialMetadata";

// This test decodes the image with sharp, a native addon the Workers runtime
// (quality-flare's Tests check) cannot load.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

describe("createOpenGraph", () => {
  it("uses the Tudo Macaé image when the shared page has no image", () => {
    expect(createOpenGraph({
      title: "Serviços em Macaé",
      description: "Encontre serviços em Macaé.",
      url: "/categoria/servicos",
    })).toMatchObject({
      siteName: "Tudo Macaé",
      locale: "pt_BR",
      images: [{
        ...DEFAULT_SOCIAL_IMAGE,
        url: "/social-preview.png",
        width: 1200,
        height: 630,
      }],
    });
  });

  it("uses content images ahead of the fallback", () => {
    expect(createOpenGraph({
      title: "Bicicleta seminova",
      description: "Bicicleta revisada.",
      url: "/anuncio/1/bicicleta-seminova",
      type: "article",
      images: [{
        url: "https://storage.test/bicicleta.webp",
        alt: "Bicicleta azul",
      }],
    }).images).toEqual([{
      url: "https://storage.test/bicicleta.webp",
      alt: "Bicicleta azul",
    }]);
  });

  it.skipIf(inWorkers)("ships the fallback image at the declared social-card dimensions", async () => {
    const image = await readFile(join(process.cwd(), "public", "social-preview.png"));

    await expect(sharp(image).metadata()).resolves.toMatchObject({
      format: "png",
      width: DEFAULT_SOCIAL_IMAGE.width,
      height: DEFAULT_SOCIAL_IMAGE.height,
    });
  });
});

describe("createSocialDescription", () => {
  it("normalizes and limits supplied copy", () => {
    expect(createSocialDescription(`  ${"a".repeat(170)}  `, "fallback"))
      .toBe("a".repeat(160));
  });

  it("uses the fallback when supplied copy is empty", () => {
    expect(createSocialDescription("   ", "fallback")).toBe("fallback");
    expect(createSocialDescription(undefined, "fallback")).toBe("fallback");
  });
});
