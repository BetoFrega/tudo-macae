import { edgeRequestIdHeader, isEdgeRequestId } from "@tudomacae/www-origin-routing/contract";
import { classifyAdSitemapError } from "@tudomacae/ads/adSitemapFailure";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";

const route = "/sitemaps/anuncios.xml";

function requestId(request: Request) {
  const incoming = request.headers.get(edgeRequestIdHeader);
  return incoming && isEdgeRequestId(incoming) ? incoming : crypto.randomUUID();
}

/** Every render records its URL count; truncation is an error because Anúncios stop being listed. */
export function logAdSitemapRender(urlCount: number, truncated: boolean, request: Request) {
  const event = { ...publicImageRuntimeContext(), route, urlCount, requestId: requestId(request) };
  console.info(JSON.stringify({ event: "ad-sitemap.rendered", ...event, outcome: "completed" }));
  if (truncated) console.error(JSON.stringify({ event: "ad-sitemap.limit_exceeded", ...event, outcome: "degraded" }));
}

export function adSitemapUnavailable(error: unknown, request: Request) {
  const id = requestId(request);
  console.error(JSON.stringify({
    event: "ad-sitemap.read_failed",
    ...publicImageRuntimeContext(),
    outcome: "failed",
    route,
    statusClass: "5xx",
    errorClass: classifyAdSitemapError(error),
    requestId: id,
  }));
  return new Response("Sitemap temporariamente indisponível.", {
    status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300", "x-request-id": id },
  });
}
