import { z } from "zod";
import { PhotoError, PhotoUploadLimited, photoByteLimit, photoDeliveryByteLimit, photoRecordSchema, type PhotoUpload } from "@tudomacae/classifieds-photos";
import { ClassifiedsRequestError } from "./protocol";
import { checkProtocol, classifiedsHeaders, classifiedsRequestId, parseServiceOrigin, unexpectedStatusError, type ClassifiedsCredential } from "./lib/transport";

const photoFailureSchema = z.object({ error: z.enum(["invalid", "forbidden", "conflict", "retired"]), message: z.string() });
const photoRateLimitSchema = z.object({ error: z.literal("rate_limit"), reason: z.enum(["account_burst", "account_daily", "global_daily"]), retryAfterMs: z.number().int().positive().max(86_400_000) });

function photoRequestInit(body: Uint8Array | string | undefined) {
  if (body === undefined) return { method: "GET" };
  return { method: "POST", body: typeof body === "string" ? body : new Uint8Array(body) };
}

async function photoFailure(result: Response, requestId: string, serverReportedFailure: boolean) {
  const body = await result.json().catch(() => null);
  const limited = photoRateLimitSchema.safeParse(body);
  if (result.status === 429 && limited.success) return new PhotoUploadLimited(limited.data.reason, limited.data.retryAfterMs);
  const failure = photoFailureSchema.safeParse(body);
  if (failure.success) return new PhotoError(failure.data.error, failure.data.message);
  return unexpectedStatusError(result.status, requestId, serverReportedFailure);
}

function adPhotoPath(adId: string, imageId: string, pending: boolean, width: number | undefined) {
  const collection = pending ? "publicacoes-pendentes" : "anuncios";
  const query = width === undefined ? "" : `?w=${width}`;
  return `/api/${collection}/${encodeURIComponent(adId)}/fotos/${encodeURIComponent(imageId)}${query}`;
}

/** Reads the whole stream, refusing it as soon as it exceeds the delivered-photo byte limit. */
async function readBoundedPhoto(body: ReadableStream<Uint8Array>, correlationId: string) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > photoDeliveryByteLimit) throw new ClassifiedsRequestError("incompatible", correlationId);
      chunks.push(chunk.value);
    }
  }
  finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function readPhoto(result: Response, correlationId: string) {
  const responseId = result.headers.get("x-request-id") ?? correlationId;
  const mimeType = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]).parse(result.headers.get("content-type"));
  if (!result.body) throw new ClassifiedsRequestError("incompatible", responseId);
  return { bytes: await readBoundedPhoto(result.body, responseId), mimeType };
}

export function createClassifiedsPhotoClient(configuration: { origin: string; publicOrigin: string; allowLocal?: boolean; request?: typeof fetch }) {
  const origin = parseServiceOrigin(configuration, "Destino de fotos inválido.");
  async function invoke(path: string, body: Uint8Array | string | undefined, credential: ClassifiedsCredential, correlationId: string, metadata?: unknown, accept?: string) {
    const requestId = classifiedsRequestId(correlationId);
    const headers = classifiedsHeaders(new URL(configuration.publicOrigin).origin, requestId, credential);
    if (accept) headers.set("accept", accept);
    if (metadata) headers.set("x-classifieds-photo", encodeURIComponent(JSON.stringify(metadata)));
    const result = await (configuration.request ?? fetch)(new URL(path, origin), { ...photoRequestInit(body), headers, signal: AbortSignal.timeout(metadata ? 45_000 : 5000) })
      .catch(() => { throw new ClassifiedsRequestError("unavailable", requestId); });
    const serverReportedFailure = checkProtocol(result, requestId);
    if (body === undefined && [404, 410].includes(result.status)) return result;
    if (!result.ok) throw await photoFailure(result, requestId, serverReportedFailure);
    return result;
  }
  return {
    async readAd(adId: string, imageId: string, pending: boolean, credential: ClassifiedsCredential = {}, correlationId = crypto.randomUUID(), width?: number, accept?: string) {
      const result = await invoke(adPhotoPath(adId, imageId, pending, width), undefined, credential, correlationId, undefined, accept);
      if (result.status === 404) return null;
      return readPhoto(result, correlationId);
    },
    async readPublic(path: string, width?: number, correlationId = crypto.randomUUID(), accept?: string) {
      const result = await invoke(`/api/classifieds/photos/public/${encodeURIComponent(path)}${width === undefined ? "" : `?w=${width}`}`, undefined, {}, correlationId, undefined, accept);
      if ([404, 410].includes(result.status)) return { status: result.status as 404 | 410 };
      return { status: 200 as const, ...await readPhoto(result, correlationId) };
    },
    async upload(input: PhotoUpload, credential: ClassifiedsCredential, correlationId = crypto.randomUUID()) {
      const { bytes, ...metadata } = input;
      if (!bytes.byteLength || bytes.byteLength > photoByteLimit) throw new PhotoError("invalid", "Escolha uma foto válida de até 1MB.");
      return photoRecordSchema.parse(await (await invoke("/api/classifieds/photos/upload", bytes, credential, correlationId, metadata)).json());
    },
    async remove(path: string, credential: ClassifiedsCredential, correlationId = crypto.randomUUID()) {
      return z.object({ status: z.literal("scheduled") }).parse(await (await invoke("/api/classifieds/photos/remove", JSON.stringify({ path }), credential, correlationId)).json());
    },
  };
}
