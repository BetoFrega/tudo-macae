import { createPublicImageWorker, publicImageRouteTemplate } from "@tudomacae/public-image-delivery/worker";
import { createCloudflareImageOrigin } from "./adapters/transform";

function imageRoute(pathname: string) {
  const editorial = pathname.startsWith("/v1/editorial/");
  const remaining = pathname.startsWith("/v1/remaining/");
  const ad = pathname.startsWith("/v1/ad/");
  // The historical alias shares the canonical cache entry, so it must use the same Classifieds origin or it could repopulate a revoked photo.
  const profile = pathname.startsWith("/v1/profile/") || pathname.startsWith("/v1/remaining/profile/");
  const identified = editorial || remaining || ad || profile || publicImageRouteTemplate(pathname) !== undefined;
  return { editorial, remaining, ad, profile, identified };
}

function logMissingClassifiedsOrigin(env: Env, ad: boolean, requestId: string) {
  console.error(JSON.stringify({ event: "public-image-delivery", service: "public-images", environment: env.ENVIRONMENT,
    release: env.CF_VERSION_METADATA?.id ?? "unknown", outcome: "failure", requestId, statusClass: "5xx",
    route: ad ? "/v1/ad/:preset/:width/:key" : "/v1/profile/:preset/:width/:key", cause: "classifieds_origin_missing" }));
}

/**
 * Classifieds images always use the Worker origin, in every environment: the D1 trigger
 * `classifieds_authority_no_rollback` keeps Classifieds from returning to `legacy`.
 */
function resolveClassifiedsOrigin(env: Env, { ad, profile }: { ad: boolean; profile: boolean }, requestId: string) {
  if (!(ad || profile)) return undefined;
  if (env.CLASSIFIEDS_ORIGIN) return env.CLASSIFIEDS_ORIGIN;
  logMissingClassifiedsOrigin(env, ad, requestId);
  return new Response(null, { status: 503, headers: { "cache-control": "no-store", "x-request-id": requestId } });
}

export default {
  async fetch(request, env, context) {
    const { editorial, remaining, ad, profile, identified } = imageRoute(new URL(request.url).pathname);
    const requestId = identified ? crypto.randomUUID() : undefined;
    const classifiedsOrigin = resolveClassifiedsOrigin(env, { ad, profile }, requestId!);
    if (classifiedsOrigin instanceof Response) return classifiedsOrigin;
    const worker = createPublicImageWorker({
      cache: caches.default,
      ...createCloudflareImageOrigin(fetch as typeof globalThis.fetch, requestId,
        editorial && env.EDITORIAL_ORIGIN_SERVICE
          ? (input, init) => env.EDITORIAL_ORIGIN_SERVICE.fetch(new Request(input, init))
          : undefined),
      log: event => console.log({
        event: "public-image-delivery",
        ...event,
        ...(identified
          ? {
              service: "public-images",
              environment: env.ENVIRONMENT ?? "unknown",
              release: env.CF_VERSION_METADATA?.id ?? "unknown",
              outcome: "failure" in event && event.failure ? "failure" : ["transformed", "fallback", "cache_present", "cache_absent"].includes(event.result) ? "success" : "denied",
              route: "routeTemplate" in event
                ? event.routeTemplate
                : remaining
                  ? "/v1/remaining/profile/avatar/:width/:key"
                  : `/v1/${event.imageClass}/${event.preset}/:width/:key`,
              statusClass: `${Math.floor(event.status / 100)}xx`,
              requestId,
            }
          : {}),
      }),
    });
    const response = await worker.fetch(request, {
      publicHost: env.PUBLIC_HOST,
      editorialOrigin: env.EDITORIAL_ORIGIN,
      ...(classifiedsOrigin ? { classifiedsOrigin } : {}),
      editorialCacheProbeSecret: env.EDITORIAL_CACHE_PROBE_SECRET,
    }, promise => context.waitUntil(promise));
    if (editorial || remaining || profile) response.headers.set("x-request-id", requestId!);
    return response;
  },
} satisfies ExportedHandler<Env>;
