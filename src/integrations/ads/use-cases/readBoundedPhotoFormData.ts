import { InvalidPhotoBytes, PhotoUploadTooLarge } from "./sanitizeAdPhoto";
import { prepareAdPhoto } from "./prepareAdPhoto";

export { InvalidPhotoBytes, PhotoUploadTooLarge } from "./sanitizeAdPhoto";

const MAX_PHOTO_REQUEST_BYTES = 4 * 1024 * 1024;

async function readChunksWithinLimit(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks;
      total += value.byteLength;
      if (total > MAX_PHOTO_REQUEST_BYTES) throw new PhotoUploadTooLarge();
      chunks.push(value);
    }
  }
  catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

function concatenate(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isValidFilePart([key, value]: [string, FormDataEntryValue], imageCount: number): boolean {
  return value instanceof File && /^file-[0-2]$/.test(key) && Number(key.slice(5)) < imageCount;
}

function assertPhotoFormShape(form: FormData): void {
  const rawImages = form.get("images");
  const images: unknown = JSON.parse(typeof rawImages === "string" ? rawImages : "null");
  if (!Array.isArray(images) || images.length > 3) throw new InvalidPhotoBytes();
  const fileParts = [...form].filter(([key]) => key.startsWith("file-"));
  const fileKeys = new Set(fileParts.map(([key]) => key));
  if (fileParts.length > 3 || fileKeys.size !== fileParts.length
    || !fileParts.every(part => isValidFilePart(part, images.length))) {
    throw new InvalidPhotoBytes();
  }
}

export async function readBoundedPhotoFormData(request: Request): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing photo upload body");
  const bytes = concatenate(await readChunksWithinLimit(reader));
  const form = await new Response(new Blob([bytes]), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
  assertPhotoFormShape(form);
  for (const [key, value] of form) {
    if (!key.startsWith("file-") || !(value instanceof File)) continue;
    form.set(key, await prepareAdPhoto(value));
  }
  return form;
}
