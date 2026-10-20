import { mediaUploadLimits } from "@tudomacae/media/ingestionPolicy";
import { createStaticMediaFileInspection } from "@tudomacae/media/fileInspection";

export async function inspectStaticMediaFile(bytes: Uint8Array) {
  const sharp = (await import("sharp")).default;
  return createStaticMediaFileInspection({ decode: async (file) => {
    const metadata = await sharp(file, { limitInputPixels: mediaUploadLimits.maxPixels, failOn: "warning" }).metadata();
    const contentType = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : metadata.format === "gif" ? "image/gif" : undefined;
    if (!contentType) throw new TypeError("unsupported image");
    return { contentType, width: metadata.width ?? 0, height: metadata.height ?? 0, pages: metadata.pages ?? 1 };
  } }).inspect(bytes);
}
