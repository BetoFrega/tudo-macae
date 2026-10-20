import { requestCorrelationIdHeader } from "../contract";

import type { RouteContext } from "./requests";

/**
 * Public reads the Worker keeps in the colo cache. A service binding response
 * never enters Cloudflare's cache by itself, whatever `Cache-Control` the
 * application sends. Lifetime is the application's `max-age`. Only
 * per-visitor-free reads belong here.
 */
export const edgeCachedPaths: ReadonlySet<string> = new Set(["/sitemaps/anuncios.xml"]);

export function isEdgeCached({ request, incoming }: RouteContext) {
  return request.method === "GET" && !incoming.search
    && edgeCachedPaths.has(incoming.pathname);
}

/**
 * Key without headers or query, so neither cookies nor a query string split or
 * bypass it. The `origin` partition keeps entries other builds stored under the
 * bare path out of reach.
 */
export function edgeCacheKey({ incoming }: RouteContext) {
  return new Request(`${incoming.origin}${incoming.pathname}?origin=terms-workers`, { method: "GET" });
}

function directives(response: Response) {
  return new Set((response.headers.get("cache-control") ?? "").split(",").map(part => part.trim().toLowerCase()));
}

/** A 404, a 503 or a response carrying a cookie or a private directive is never stored. */
export function isEdgeStorable(response: Response) {
  if (response.status !== 200 || response.headers.has("set-cookie")) return false;
  const cacheControl = directives(response);
  const maxAge = [...cacheControl].find(directive => /^max-age=[1-9]\d*$/u.test(directive));
  return cacheControl.has("public") && maxAge !== undefined
    && !cacheControl.has("private") && !cacheControl.has("no-store") && !cacheControl.has("no-cache");
}

/** The stored copy drops the request id; a hit stamps its own. */
export function storedResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete(requestCorrelationIdHeader);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function cachedResponse(cached: Response, context: RouteContext) {
  const headers = new Headers(cached.headers);
  headers.set(requestCorrelationIdHeader, context.requestId);
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
}
