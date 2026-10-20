import { readPublicMediaContent } from "@/packages/editorial/publicMediaProduction";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { PublicMediaReadFailure } from "@tudomacae/editorial-blog/publicMediaContent";

type Context = { params: Promise<{ mediaId: string; digest: string }> };

/** Logs an origin failure once: a failure the API Worker already logged is relayed silently. */
function reportFailure(error: unknown, requestId: string) {
  if (error instanceof PublicMediaReadFailure && error.reportedByWorker) return;
  console.error(JSON.stringify({
    event: "editorial_image_origin_failure", ...publicImageRuntimeContext(),
    outcome: "failure", route: "/api/imagens/editorial/:mediaId/:digest", statusClass: "5xx", requestId,
    failure: "dependency", stage: error instanceof PublicMediaReadFailure ? error.stage : "initialization",
  }));
}

async function respond(request: Request, context: Context, head: boolean) {
  const suppliedId = request.headers.get("x-request-id");
  const requestId = suppliedId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(suppliedId) ? suppliedId : crypto.randomUUID();
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "x-request-id": requestId };
  if (process.env.EDITORIAL_IMAGE_ORIGIN_ENABLED !== "1") return new Response(null, { status: 404, headers });
  const { mediaId, digest } = await context.params;
  let content;
  try {
    content = await readPublicMediaContent(mediaId, digest, requestId, head ? "HEAD" : "GET");
  }
  catch (error) {
    reportFailure(error, requestId);
    return new Response(null, { status: 502, headers });
  }
  if (!content) return new Response(null, { status: 404, headers });
  return new Response(head ? null : new Uint8Array(content.bytes), {
    headers: { ...headers, "Content-Type": content.mimeType },
  });
}

export const GET = (request: Request, context: Context) => respond(request, context, false);
export const HEAD = (request: Request, context: Context) => respond(request, context, true);
