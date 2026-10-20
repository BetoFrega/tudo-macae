type FetchHandler = { fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Response | Promise<Response> };

/** What Next sends on a dynamic response that sets no policy of its own (ADR 0017). */
export const dynamicCacheControl = "private, no-cache, no-store, max-age=0, must-revalidate";

/**
 * vinext leaves `Cache-Control` out of dynamic pages, not-found pages and
 * metadata routes, so a browser or proxy could keep a personal page. A
 * response that names its own policy keeps it.
 */
export function withResponsePolicy<Handler extends FetchHandler>(handler: Handler): Handler {
  return {
    ...handler,
    async fetch(request, env, ctx) {
      const response = await handler.fetch(request, env, ctx);
      if (response.headers.has("cache-control")) return response;
      const headers = new Headers(response.headers);
      headers.set("cache-control", dynamicCacheControl);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
