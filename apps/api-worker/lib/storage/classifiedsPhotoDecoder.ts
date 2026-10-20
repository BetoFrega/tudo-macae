import { PhotoError, photoByteLimit, type PhotoDependencies } from "@tudomacae/classifieds-photos";

export class ClassifiedsPhotoDecodeUnavailable extends Error {
  readonly causeCode: string;
  constructor(cause: unknown) {
    super("Images decoding unavailable", { cause });
    this.name = "ClassifiedsPhotoDecodeUnavailable";
    const code = typeof cause === "object" && cause && "code" in cause ? Number(cause.code) : undefined;
    this.causeCode = code !== undefined && [9402, 9422, 9432, 9523].includes(code) ? `images_decode_${code}` : "images_decode_unavailable";
  }
}
type DecoderImages = Pick<ImagesBinding, "info" | "input">;
type OutputFormat = "image/jpeg" | "image/webp";
export interface SanitizedClassifiedsPhoto {
  bytes: Uint8Array; mimeType: OutputFormat; sourceMimeType: string; width: number; height: number;
}

export function byteStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes);
    controller.close();
  } });
}
async function readDimensions(images: DecoderImages, bytes: Uint8Array, maxPixels: number | undefined) {
  const info = await images.info(byteStream(bytes));
  const invalid = () => new PhotoError("invalid", "Imagem inválida ou acima dos limites do envio.");
  if (!("width" in info) || info.width < 1 || info.height < 1) throw invalid();
  if (maxPixels !== undefined && info.width * info.height > maxPixels) throw invalid();
  return { mimeType: info.format, width: info.width, height: info.height };
}
// Metadata alone accepts truncated payloads. Consume a decoded transformation;
// sanitized uploads keep only the first frame, like the browser form.
function transformation(images: DecoderImages, bytes: Uint8Array, sanitize: boolean, format: OutputFormat) {
  const source = images.input(byteStream(bytes));
  const transformed = sanitize ? source.transform({}) : source.transform({ width: 1, height: 1, fit: "scale-down" });
  const background = sanitize && format === "image/jpeg" ? { background: "#ffffff" } : {};
  return transformed.output({ format, anim: !sanitize, ...background });
}
async function readOutput(output: ImageTransformationResult, keep: boolean) {
  const reader = output.image().getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > photoByteLimit) throw new PhotoError("invalid", "A imagem processada excede o limite de 1MB.");
      if (keep) chunks.push(part.value);
    }
    if (!size) throw new PhotoError("invalid", "Imagem vazia.");
  }
  finally { await reader.cancel(); }
  const result = new Uint8Array(keep ? size : 0);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
function decodeFailure(error: unknown) {
  if (error instanceof PhotoError) return error;
  if (typeof error === "object" && error && "code" in error && [9412, 9413].includes(Number(error.code))) return new PhotoError("invalid", "A imagem não pôde ser decodificada.");
  return new ClassifiedsPhotoDecodeUnavailable(error);
}
function processor(images: DecoderImages, sanitize: boolean) {
  return async (bytes: Uint8Array, maxPixels?: number, format: OutputFormat = "image/webp") => {
    try {
      const dimensions = await readDimensions(images, bytes, maxPixels);
      const output = await transformation(images, bytes, sanitize, format);
      if (output.contentType() !== format) throw new PhotoError("invalid", "A imagem não pôde ser decodificada.");
      return { bytes: await readOutput(output, sanitize), ...dimensions };
    }
    catch (error) {
      throw decodeFailure(error);
    }
  };
}

export function createClassifiedsPhotoDecoder(images: DecoderImages): PhotoDependencies["decode"] {
  const decode = processor(images, false);
  return async (bytes, maxPixels) => {
    const { mimeType, width, height } = await decode(bytes, maxPixels);
    return { mimeType, width, height };
  };
}
export function createClassifiedsPhotoSanitizer(images: DecoderImages) {
  const sanitize = processor(images, true);
  return async (bytes: Uint8Array, maxPixels?: number, mimeType: OutputFormat = "image/jpeg"): Promise<SanitizedClassifiedsPhoto> => {
    const result = await sanitize(bytes, maxPixels, mimeType);
    return { ...result, sourceMimeType: result.mimeType, mimeType };
  };
}
