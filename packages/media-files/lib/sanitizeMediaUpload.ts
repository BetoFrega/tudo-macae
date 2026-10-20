import sharp, { type Metadata } from "sharp";
import { createHash } from "node:crypto";
import { MediaIngestionError, mediaUploadLimits } from "@tudomacae/media/ingestionPolicy";
import { staticMediaContentTypeFromSignature } from "@tudomacae/media/fileInspection";

function hasRejectedDimensions({ width, height, pages }: Metadata) {
  return !width || !height || width > mediaUploadLimits.maxDimension
    || height > mediaUploadLimits.maxDimension || (pages ?? 1) !== 1;
}

export async function sanitizeMediaUpload(bytes: Buffer) {
  try {
    if (bytes.length === 0 || bytes.length > mediaUploadLimits.maxBytes) throw new Error("bytes");
    if (!staticMediaContentTypeFromSignature(bytes)) throw new Error("format");
    const image = sharp(bytes, { limitInputPixels: mediaUploadLimits.maxPixels, failOn: "warning" });
    const metadata = await image.metadata();
    if (hasRejectedDimensions(metadata)) throw new Error("dimensions");
    const sanitized = await image.rotate().webp({ quality: 85 }).timeout({ seconds: 5 }).toBuffer();
    if (sanitized.length > mediaUploadLimits.maxBytes) throw new Error("output bytes");
    return { bytes: sanitized, digest: createHash("sha256").update(sanitized).digest("hex") };
  }
  catch {
    throw new MediaIngestionError("validationFailed", "Imagem inválida, animada ou acima dos limites de bytes e pixels. Envie uma imagem estática de até 1 MiB.");
  }
}
