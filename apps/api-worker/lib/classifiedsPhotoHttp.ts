import { negotiatedImageFormat } from "@tudomacae/public-image-delivery/contract";
import { publicationIdentifier } from "@tudomacae/ads/validation";
import { publicImageCacheGeneration } from "@tudomacae/public-image-delivery/cacheTag";
import { publicImageDeviceSizes, publicImageSizes } from "@tudomacae/public-image-delivery/contract";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PhotoError, PhotoUploadLimited, type createPhotoLifecycle, type PhotoActor } from "@tudomacae/classifieds-photos";
import { PersistenceConflict, PersistenceLimit } from "@tudomacae/classifieds-persistence";

export type ClassifiedsPhotos = ReturnType<typeof createPhotoLifecycle>;
export type ClassifiedsPhotoRenderer = (bytes: Uint8Array, width: number) => Promise<ReadableStream<Uint8Array>>;
const widths = new Set<number>([...publicImageDeviceSizes, ...publicImageSizes]);
export function isClassifiedsPhotoRoute(path: string) {
  return path.startsWith("/api/classifieds/photos/") || /^\/api\/(anuncios|publicacoes-pendentes)\/[^/]+\/fotos\/[^/]+$/.test(path);
}
type PhotoRequest = {
  request: Request; photos: ClassifiedsPhotos; actor(): Promise<PhotoActor | undefined>;
  render?: ClassifiedsPhotoRenderer | undefined;
  report(error: unknown, operation: string): void;
};
type PhotoResult = NonNullable<Awaited<ReturnType<ClassifiedsPhotos["readAd"]>>>;
/** The operation reported when the request fails; mutating routes replace the default read. */
type PhotoTrace = { operation: string };

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "vary": "Cookie, Authorization, Accept" };
const emptyResponse = (status: number) => new Response(null, { status, headers });
const isReadMethod = (request: Request) => ["GET", "HEAD"].includes(request.method);

function requestedWidth(url: URL) {
  const widthParam = url.searchParams.get("w");
  return widthParam === null ? undefined : Number(widthParam);
}

function legacyTargetStatus(adId: string, imageId: string, width: number | undefined) {
  if (!publicationIdentifier.safeParse(adId).success || !imageId) return 404;
  if (width !== undefined && !widths.has(width)) return 400;
  return undefined;
}

async function renderLegacyPhoto(input: PhotoRequest, result: PhotoResult, width: number | undefined) {
  const resize = width !== undefined && result.mimeType !== "image/gif" && !("delivered" in result);
  if (resize && !input.render) throw new PhotoError("unavailable", "O redimensionamento da foto está indisponível.");
  const body = input.request.method === "HEAD" ? null : resize ? await input.render!(result.bytes, Math.min(width!, 1920)) : new Uint8Array(result.bytes);
  return new Response(body, { headers: { ...headers, "content-type": resize ? "image/webp" : result.mimeType } });
}

async function serveLegacyPhoto(input: PhotoRequest, url: URL, [, owner, encodedAdId, encodedImageId]: RegExpExecArray) {
  const { request, photos } = input;
  if (!isReadMethod(request)) return emptyResponse(405);
  const adId = decodeURIComponent(encodedAdId!);
  const imageId = decodeURIComponent(encodedImageId!);
  const width = requestedWidth(url);
  const status = legacyTargetStatus(adId, imageId, width);
  if (status) return emptyResponse(status);
  const pending = owner === "publicacoes-pendentes";
  const actor = pending ? await input.actor() : undefined;
  if (pending && !actor) return emptyResponse(404);
  const result = await photos.readAd(adId, imageId, actor, request.method === "HEAD", { width: width ?? 1920, format: negotiatedImageFormat(request.headers.get("accept")) });
  if (!result) return emptyResponse(404);
  return renderLegacyPhoto(input, result, width);
}

function invalidPublicQuery(request: Request, url: URL) {
  return !isReadMethod(request)
    || [...url.searchParams.keys()].some(key => !["cache_generation", "w", "format"].includes(key))
    || (url.searchParams.has("cache_generation") && url.searchParams.get("cache_generation") !== publicImageCacheGeneration);
}

function publicPhotoPath(url: URL) {
  const path = decodeURIComponent(url.pathname.slice("/api/classifieds/photos/public/".length));
  return path.length <= 2048 && (path.startsWith("ad-images/") || path.startsWith("profile-photos/")) ? path : undefined;
}

async function servePublicPhoto({ request, photos }: PhotoRequest, url: URL) {
  if (invalidPublicQuery(request, url)) return emptyResponse(400);
  const width = url.searchParams.has("w") ? Number(url.searchParams.get("w")) : 1920;
  const format = z.enum(["avif", "webp", "jpeg"]).parse(url.searchParams.get("format") ?? negotiatedImageFormat(request.headers.get("accept")));
  if (!widths.has(width)) return emptyResponse(400);
  const path = publicPhotoPath(url);
  if (!path) return emptyResponse(404);
  const result = await photos.read(path, undefined, request.method === "HEAD", { width, format });
  if (!result) return emptyResponse(await photos.revoked(path) ? 410 : 404);
  return new Response(request.method === "HEAD" ? null : new Uint8Array(result.bytes), { headers: { ...headers, "content-type": result.mimeType } });
}

async function uploadPhoto({ request, photos }: PhotoRequest, actor: PhotoActor) {
  const encoded = request.headers.get("x-classifieds-photo");
  if (!encoded || encoded.length > 32768) throw new PhotoError("invalid", "Envio inválido.");
  const value = z.object({ ownerKind: z.enum(["ad", "profile"]), ownerId: z.string(), operationId: z.string(), expectedRevision: z.number(), pendingPublication: z.literal(true).optional(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]), title: z.string().optional(), description: z.string().optional() }).parse(JSON.parse(decodeURIComponent(encoded)));
  return Response.json(await photos.upload(actor, { ...value, bytes: new Uint8Array(await request.arrayBuffer()) }), { headers });
}

async function removePhoto({ request, photos }: PhotoRequest, actor: PhotoActor) {
  const value = z.object({ path: z.string() }).parse(await request.json());
  return Response.json(await photos.remove(actor, value.path), { headers });
}

async function serveActorPhoto(input: PhotoRequest, url: URL, trace: PhotoTrace) {
  const actor = await input.actor();
  if (!actor) return emptyResponse(401);
  if (url.pathname === "/api/classifieds/photos/upload" && input.request.method === "POST") {
    trace.operation = "photos.upload";
    return await uploadPhoto(input, actor);
  }
  if (url.pathname === "/api/classifieds/photos/remove" && input.request.method === "POST") {
    trace.operation = "photos.remove";
    return await removePhoto(input, actor);
  }
  return emptyResponse(404);
}

function photoErrorStatus(code: string) {
  if (code === "forbidden") return 403;
  return ["conflict", "retired"].includes(code) ? 409 : 400;
}

const isMalformedRequest = (error: unknown) => error instanceof z.ZodError || error instanceof SyntaxError || error instanceof URIError;

function photoFailure(error: unknown, input: PhotoRequest, operation: string) {
  if (error instanceof PhotoUploadLimited) return Response.json({ error: error.code, message: error.message, reason: error.reason, retryAfterMs: error.retryAfterMs }, { status: 429, headers: { ...headers, "retry-after": String(Math.ceil(error.retryAfterMs / 1000)) } });
  if (error instanceof PhotoError && error.code !== "unavailable") return Response.json({ error: error.code, message: error.message }, { status: photoErrorStatus(error.code), headers });
  if (error instanceof PersistenceConflict || error instanceof PersistenceLimit) return Response.json({ error: "conflict", message: "O conteúdo mudou. Tente novamente." }, { status: 409, headers });
  if (error instanceof TRPCError && error.code === "FORBIDDEN") return emptyResponse(403);
  if (isMalformedRequest(error)) return emptyResponse(400);
  input.report(error, operation);
  return Response.json({ error: "unavailable", message: "Não foi possível concluir a operação da foto. Tente novamente." }, { status: 503, headers });
}

export async function serveClassifiedsPhoto(input: PhotoRequest) {
  const url = new URL(input.request.url);
  const trace: PhotoTrace = { operation: "photos.read" };
  try {
    const legacy = /^\/api\/(anuncios|publicacoes-pendentes)\/([^/]+)\/fotos\/([^/]+)$/.exec(url.pathname);
    if (legacy) return await serveLegacyPhoto(input, url, legacy);
    if (url.pathname.startsWith("/api/classifieds/photos/public/")) return await servePublicPhoto(input, url);
    return await serveActorPhoto(input, url, trace);
  }
  catch (error) {
    return photoFailure(error, input, trace.operation);
  }
}
