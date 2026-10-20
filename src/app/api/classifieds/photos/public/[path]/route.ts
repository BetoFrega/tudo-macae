import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { classifiedsPhotos } from "@/packages/classifieds-api/photos";
import { publicImageDeviceSizes, publicImageSizes } from "@tudomacae/public-image-delivery/contract";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "vary": "Accept" };
const widths = new Set<number>([...publicImageDeviceSizes, ...publicImageSizes]);
const validPath = (path: string) => path.length <= 2048 && /^(ad-images|profile-photos)\/[A-Za-z0-9._/-]+$/.test(path) && path.split("/").every(part => part && part !== "." && part !== "..");

/** Returns the requested width, null when the query is invalid, or undefined for the original size. */
function requestedWidth(url: URL) {
  const width = url.searchParams.has("w") ? Number(url.searchParams.get("w")) : undefined;
  if ([...url.searchParams.keys()].some(key => key !== "w") || (width !== undefined && !widths.has(width))) return null;
  return width;
}

function readFailure(error: unknown, correlationId: string) {
  const supportId = error instanceof ClassifiedsRequestError ? error.requestId : correlationId;
  if (!(error instanceof ClassifiedsRequestError && error.serverReportedFailure)) console.error(JSON.stringify({ event: "classifieds.photo.read_failed", ...publicImageRuntimeContext(), statusClass: "5xx", outcome: "failed", correlationId: supportId, cause: "read", route: "/api/classifieds/photos/public/[path]" }));
  return new Response(null, { status: 503, headers: { ...headers, "x-operation-id": supportId } });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  if (!validPath(path)) return new Response(null, { status: 404, headers });
  const width = requestedWidth(new URL(request.url));
  if (width === null) return new Response(null, { status: 400, headers });
  const correlationId = crypto.randomUUID();
  try {
    const result = await classifiedsPhotos().readPublic(path, width, correlationId, request.headers.get("accept") ?? undefined);
    return result.status === 200
      ? new Response(new Uint8Array(result.bytes), { headers: { ...headers, "content-type": result.mimeType } })
      : new Response(null, { status: result.status, headers });
  }
  catch (error) {
    return readFailure(error, correlationId);
  }
}
