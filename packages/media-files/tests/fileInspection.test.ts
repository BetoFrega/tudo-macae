import { expect, test } from "vitest";
import sharp from "sharp";
import { createStaticMediaFileInspection, type StaticMediaFileDetails } from "@tudomacae/media/fileInspection";
import { inspectStaticMediaFile } from "@tudomacae/media-files/fileInspectionProduction";
import { mediaUploadLimits } from "@tudomacae/media";

// These tests decode images with sharp, a native addon the Workers runtime
// (quality-flare's Tests check) cannot load.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const signatures = {
  "image/jpeg": new Uint8Array([0xff, 0xd8, 0xff]),
  "image/png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  "image/webp": new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
  "image/gif": new TextEncoder().encode("GIF89a"),
} as const;

test.each(Object.entries(signatures))("accepts the real %s signature with decoded static facts", async (contentType, bytes) => {
  const inspection = createStaticMediaFileInspection({ decode: async () => ({ contentType, width: 1, height: 1, pages: 1 }) as StaticMediaFileDetails });
  await expect(inspection.inspect(bytes)).resolves.toMatchObject({ contentType, width: 1, height: 1 });
});

test.skipIf(inWorkers).each(["jpeg", "png", "webp", "gif"] as const)("maps a real static %s through the Sharp production decoder", async (format) => {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#ffffff" } })[format]().toBuffer();
  await expect(inspectStaticMediaFile(bytes)).resolves.toMatchObject({ contentType: `image/${format === "jpeg" ? "jpeg" : format}` });
});

test("rejects more than the public byte limit before decoding", async () => {
  await expect(inspectStaticMediaFile(new Uint8Array(mediaUploadLimits.maxBytes + 1))).rejects.toThrow("invalid media file");
});

test.each([
  [new Uint8Array([1, 2, 3]), { contentType: "image/png", width: 1, height: 1, pages: 1 }],
  [signatures["image/png"], { contentType: "image/jpeg", width: 1, height: 1, pages: 1 }],
  [signatures["image/gif"], { contentType: "image/gif", width: 1, height: 1, pages: 2 }],
  [signatures["image/jpeg"], { contentType: "image/jpeg", width: 8_193, height: 1, pages: 1 }],
  [signatures["image/jpeg"], { contentType: "image/jpeg", width: 4_001, height: 4_001, pages: 1 }],
])("rejects invalid signature or decoded static-image facts", async (bytes, details) => {
  const inspection = createStaticMediaFileInspection({ decode: async () => details as StaticMediaFileDetails });
  await expect(inspection.inspect(bytes)).rejects.toThrow("invalid media file");
});
