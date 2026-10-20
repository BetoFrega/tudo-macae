// @vitest-environment node
import { readFile } from "node:fs/promises";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { describe, expect, test, vi } from "vitest";
import {
  publicImageDeviceSizes,
  publicImagePresetWidths,
  publicImageSizes,
} from "@tudomacae/public-image-delivery/contract";

describe("public image configuration", () => {
  test("production uses the direct custom loader without a Firebase rewrite", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    try {
      const { default: configuration } = await import("../next.config");
      expect(configuration.images).toMatchObject({ loader: "custom", loaderFile: "./image-loader.js" });
      const rewrites = await configuration.rewrites?.() ?? [];
      expect(JSON.stringify(rewrites)).not.toMatch(/_fah|ext-image-processing/u);
    }
    finally {
      vi.unstubAllEnvs();
    }
  });

  test("does not change the candidate grid for image consumers outside the canary", async () => {
    const nextConfigSource = await readFile(
      new URL("../next.config.ts", import.meta.url),
      "utf8",
    );
    expect(nextConfigSource).not.toMatch(/\b(?:deviceSizes|imageSizes)\s*:/u);
    expect(publicImageDeviceSizes).toEqual(imageConfigDefault.deviceSizes);
    expect(publicImageSizes).toEqual(imageConfigDefault.imageSizes);
  });

  test("adopted delivery has no remaining rollout configuration", async () => {
    const source = await readFile(new URL("../apps/public-images/wrangler.jsonc", import.meta.url), "utf8");
    expect(source).not.toMatch(/(?:REMAINING|EDITORIAL)_PROJECT_TOKEN/u);
  });

  test("keeps the operational manifest aligned with the closed presets", async () => {
    const manifest = JSON.parse(await readFile(
      new URL("../config/public-image-canary.json", import.meta.url),
      "utf8",
    ));

    expect(manifest.presets).toEqual({
      "ad/card": publicImagePresetWidths.ad.card,
      "ad/gallery": publicImagePresetWidths.ad.gallery,
      "ad/thumbnail": publicImagePresetWidths.ad.thumbnail,
      "profile/avatar": publicImagePresetWidths.profile.avatar,
    });
    expect(manifest.activation).toEqual({
      transformation: {
        provider: "cloudflare",
        mode: "always-on",
        transformedEdgeCacheSeconds: 31_536_000,
        transformedEdgeInvalidation: "automatic-purge-on-origin-deletion",
      },
      requiresExplicitProductionOperation: true,
    });
  });
});
