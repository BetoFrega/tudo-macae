import { readPublishedArticleMedia } from "@/packages/editorial/articleLifecycleProduction";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { PublicBlogRequestError } from "@tudomacae/editorial-blog/publicClient";

const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

async function read(id: string, mediaId: string, requestId: string) {
  try {
    return { content: await readPublishedArticleMedia(id, mediaId, requestId) };
  }
  catch (error) {
    // A failure the API Worker already logged is relayed silently.
    if (!(error instanceof PublicBlogRequestError)) throw error;
    if (!error.reportedByWorker) {
      console.error(JSON.stringify({
        event: "article_media_failure", ...publicImageRuntimeContext(), outcome: "failure",
        route: "/noticia/:id/midias/:mediaId", statusClass: "5xx", requestId, failure: error.code,
      }));
    }
    return { failed: true as const };
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const { id, mediaId } = await params;
  // The same request ID reaches the API Worker's Blog signal and comes back to the caller.
  const supplied = request.headers.get("x-request-id");
  const requestId = supplied && requestIdPattern.test(supplied) ? supplied : crypto.randomUUID();
  const headers = { "Cache-Control": "private, no-store", "x-request-id": requestId };
  const result = await read(id, mediaId, requestId);
  if ("failed" in result) return new Response(null, { status: 502, headers });
  if (!result.content) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(result.content.bytes), { headers: {
    ...headers, "Content-Type": result.content.mimeType, "X-Content-Type-Options": "nosniff",
  } });
}
