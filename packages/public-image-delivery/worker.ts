import { classifiedsImageSourceUrl } from "./source";
import { editorialImageSourceUrl } from "./editorial";
import { editorialCacheProbeHeader } from "./contract";
import { publicImageCacheGeneration } from "./cacheTag";
import type {
  Defer,
  ParsedImageRequest,
  PublicImageWorkerConfiguration,
  PublicImageWorkerDependencies,
} from "./lib/workerTypes";
import { invalidPublicImageRequestEvent, parseRequest, publicImageRouteTemplate } from "./lib/workerRequest";
import { unavailableImageResponse } from "./lib/workerUnavailable";
import { editorialCacheProbeResponse } from "./lib/workerCacheProbe";
import { cachedImageResponse, originStatus, uncachedImageResponse } from "./lib/workerDelivery";

export type {
  InvalidPublicImageRequestLogEvent,
  PublicImageCache,
  PublicImageDeliveryLogEvent,
  PublicImageLogEvent,
  PublicImageRouteTemplate,
  PublicImageTransform,
  PublicImageTransformOptions,
  PublicImageWorkerConfiguration,
} from "./lib/workerTypes";
export { publicImageRouteTemplate } from "./lib/workerRequest";

function invalidImageRequestResponse(dependencies: PublicImageWorkerDependencies, request: Request): Response {
  const routeTemplate = publicImageRouteTemplate(new URL(request.url).pathname);
  if (routeTemplate) dependencies.log(invalidPublicImageRequestEvent(routeTemplate));
  return new Response("Invalid image request", { status: 400, headers: { "cache-control": "no-store" } });
}

function rejectedImageResponse(
  dependencies: PublicImageWorkerDependencies,
  parsed: ParsedImageRequest,
  cache: "miss" | "uninspected",
  failure: "configuration" | "cache",
): Response {
  dependencies.log({ cache, failure, imageClass: parsed.imageClass, preset: parsed.preset, result: "rejected", status: 502 });
  return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
}

function cacheUrlFor(request: Request, parsed: ParsedImageRequest): URL {
  const cacheUrl = new URL(request.url);
  if (parsed.remaining) cacheUrl.pathname = cacheUrl.pathname.replace("/v1/remaining/", "/v1/");
  cacheUrl.searchParams.set("generation", publicImageCacheGeneration);
  cacheUrl.searchParams.set("format", parsed.format);
  return cacheUrl;
}

/** `parseRequest` admits an editorial key only with a valid editorial origin; Ad/Profile need a valid Classifieds origin. */
function originFor(parsed: ParsedImageRequest, configuration: PublicImageWorkerConfiguration): string | null {
  if (parsed.imageClass === "editorial") return editorialImageSourceUrl(parsed.key, configuration.editorialOrigin!)!;
  return classifiedsImageSourceUrl(parsed.key, configuration.classifiedsOrigin ?? "");
}

async function matchCache(
  dependencies: PublicImageWorkerDependencies,
  cacheKey: Request,
): Promise<{ failed: false; cached: Response | undefined } | { failed: true }> {
  try {
    return { failed: false, cached: await dependencies.cache.match(cacheKey) };
  }
  catch {
    return { failed: true };
  }
}

export function createPublicImageWorker(dependencies: PublicImageWorkerDependencies) {
  return {
    async fetch(
      request: Request,
      configuration: PublicImageWorkerConfiguration,
      defer?: Defer,
    ): Promise<Response> {
      const parsed = parseRequest(request, configuration);
      if (!parsed) return invalidImageRequestResponse(dependencies, request);

      const origin = originFor(parsed, configuration);
      if (!origin) return rejectedImageResponse(dependencies, parsed, "miss", "configuration");
      const editorial = parsed.imageClass === "editorial";
      const cacheUrl = cacheUrlFor(request, parsed);
      // Every delivered class relies on event-driven purge verified by complete cache probes.
      if (request.headers.has(editorialCacheProbeHeader)) {
        return editorialCacheProbeResponse(dependencies, request, parsed, configuration, cacheUrl);
      }

      const cacheKey = new Request(cacheUrl, { method: "GET" });
      const lookup = await matchCache(dependencies, cacheKey);
      if (lookup.failed) return rejectedImageResponse(dependencies, parsed, "uninspected", "cache");
      const { cached } = lookup;
      const context = { dependencies, request, parsed, origin, editorial };
      // Warm hits skip the origin; a cold editorial read checks it, and a cold Hosted read answers its own status.
      if (cached) return cachedImageResponse(context, cached);
      if (editorial) {
        const status = await originStatus(dependencies, origin);
        if (status !== 200) return unavailableImageResponse(dependencies, request, parsed, status, "miss");
      }
      return uncachedImageResponse(context, cacheKey, defer);
    },
  };
}
