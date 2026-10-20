import { publicImageCacheGeneration, publicImageCacheTag } from "../cacheTag";
import type {
  Defer,
  ParsedImageRequest,
  PublicImageTransformOptions,
  PublicImageWorkerDependencies,
} from "./workerTypes";
import { unavailableImageResponse } from "./workerUnavailable";

export interface ImageDeliveryContext {
  dependencies: PublicImageWorkerDependencies;
  request: Request;
  parsed: ParsedImageRequest;
  origin: string;
  editorial: boolean;
}

function withDeliveryHeaders(
  response: Response,
  result: "fallback" | "transformed",
  cache: "hit" | "miss",
  cacheControl = response.ok ? "public, max-age=30" : "no-store",
): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControl);
  headers.set("vary", "Accept");
  headers.set("x-image-cache", cache);
  headers.set("x-image-result", result);
  return new Response(response.body, { status: response.status, headers });
}

function deliveryResponse(
  context: ImageDeliveryContext,
  response: Response,
  result: "transformed" | "fallback",
  cache: "hit" | "miss",
): Response {
  const { editorial, request } = context;
  const delivered = withDeliveryHeaders(response, result, cache, editorial ? "private, no-store" : undefined);
  if (!editorial && delivered.ok) {
    // Public freshness starts at delivery, independently of upstream cache age.
    delivered.headers.delete("age");
    delivered.headers.set("date", new Date().toUTCString());
  }
  if (editorial) delivered.headers.set("vary", "Accept");
  return request.method === "HEAD" ? new Response(null, delivered) : delivered;
}

export function originStatus(dependencies: PublicImageWorkerDependencies, origin: string): Promise<number> {
  return dependencies.checkOrigin(origin).then(response => response.status, () => 502);
}

export function cachedImageResponse(context: ImageDeliveryContext, cached: Response): Response {
  const response = deliveryResponse(context, cached, "transformed", "hit");
  context.dependencies.log({
    cache: "hit",
    imageClass: context.parsed.imageClass,
    preset: context.parsed.preset,
    result: "transformed",
    status: response.status,
  });
  return response;
}

/**
 * Hosted Images already returns the negotiated variant, so the Worker never transforms Ad/Profile photos.
 * Without `w`/`format` the origin would answer for its 1920px default.
 */
async function hostedVariant(context: ImageDeliveryContext): Promise<Response | undefined> {
  const url = new URL(context.origin);
  url.searchParams.set("w", String(context.parsed.width));
  url.searchParams.set("format", context.parsed.format);
  url.searchParams.set("cache_generation", publicImageCacheGeneration);
  try {
    return await context.dependencies.fetchOriginal(url.toString());
  }
  catch {
    return undefined;
  }
}

async function transformEditorialImage(context: ImageDeliveryContext) {
  const image = {
    preserveAnimation: false,
    resize: "scale-down",
    format: context.parsed.format,
    stripMetadata: true,
    quality: 75,
    width: context.parsed.width,
  } satisfies PublicImageTransformOptions;
  try {
    const transformedOrigin = new URL(context.origin);
    transformedOrigin.searchParams.set("cache_generation", publicImageCacheGeneration);
    return await context.dependencies.transform(transformedOrigin.toString(), image);
  }
  catch {
    // A failed transformation fetch still gets one credential-free attempt
    // against the same derived public origin.
    return { response: undefined, failure: "transformation" as const };
  }
}

async function storedTransformedResponse(
  context: ImageDeliveryContext,
  transformed: Response,
  cacheKey: Request,
  cacheTag: string,
  defer: Defer | undefined,
): Promise<Response> {
  const { dependencies, parsed } = context;
  const cacheEntry = withDeliveryHeaders(
    transformed,
    "transformed",
    "miss",
    "public, max-age=31536000, immutable",
  );
  cacheEntry.headers.delete("cdn-cache-control");
  cacheEntry.headers.delete("cloudflare-cdn-cache-control");
  cacheEntry.headers.set("Cache-Tag", cacheTag);
  const cacheWrite = dependencies.cache.put(cacheKey, cacheEntry.clone()).catch(() => {
    dependencies.log({
      cache: "miss",
      failure: "cache",
      imageClass: parsed.imageClass,
      preset: parsed.preset,
      result: "cache_write_failed",
      status: transformed.status,
    });
  });
  const response = deliveryResponse(context, cacheEntry, "transformed", "miss");
  dependencies.log({
    cache: "miss",
    imageClass: parsed.imageClass,
    preset: parsed.preset,
    result: "transformed",
    status: response.status,
  });
  if (defer) defer(cacheWrite);
  else await cacheWrite;
  return response;
}

/** Only editorial images fall back to their original; a Hosted variant is already the provider's output. */
async function fallbackImageResponse(
  context: ImageDeliveryContext,
  failure: "origin" | "transformation",
): Promise<Response> {
  const { dependencies, parsed } = context;
  let original: Response;
  try {
    original = await dependencies.fetchOriginal(context.origin);
  }
  catch {
    original = new Response("Public image origin unavailable", { status: 502 });
  }
  if (!original.ok) {
    return unavailableImageResponse(dependencies, context.request, parsed, original.status, "miss");
  }
  const response = deliveryResponse(context, original, "fallback", "miss");
  dependencies.log({
    cache: "miss",
    failure: original.status === 502 ? "origin" : failure,
    imageClass: parsed.imageClass,
    preset: parsed.preset,
    result: "fallback",
    status: response.status,
  });
  return response;
}

export async function uncachedImageResponse(
  context: ImageDeliveryContext,
  cacheKey: Request,
  defer: Defer | undefined,
): Promise<Response> {
  const { dependencies, request, parsed } = context;
  const cacheTag = await publicImageCacheTag(parsed.key);
  if (!context.editorial) {
    const variant = await hostedVariant(context);
    if (!variant?.ok) return unavailableImageResponse(dependencies, request, parsed, variant?.status ?? 502, "miss");
    return storedTransformedResponse(context, variant, cacheKey, cacheTag, defer);
  }
  const { response: transformed, failure } = await transformEditorialImage(context);
  if (!transformed?.ok) return fallbackImageResponse(context, failure);
  const status = await originStatus(dependencies, context.origin);
  if (status !== 200) return unavailableImageResponse(dependencies, request, parsed, status, "miss");
  return storedTransformedResponse(context, transformed, cacheKey, cacheTag, defer);
}
