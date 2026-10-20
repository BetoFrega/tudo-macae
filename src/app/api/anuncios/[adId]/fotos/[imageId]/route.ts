import { classifiedsPhotos } from "@/packages/classifieds-api/photos";
import { publicImageDeviceSizes, publicImageSizes } from "@tudomacae/public-image-delivery/contract";
import { publicationIdentifier } from "@tudomacae/ads/validation";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Accept" };
const widths = new Set<number>([...publicImageDeviceSizes, ...publicImageSizes]);

function requestedWidth(request: Request) {
  const widthParam = new URL(request.url).searchParams.get("w");
  return widthParam === null ? undefined : Number(widthParam);
}

async function readPublishedPhoto(adId: string, imageId: string, width: number | undefined, operationId: string, accept: string | undefined) {
  return classifiedsPhotos().readAd(adId, imageId, false, {}, operationId, width, accept);
}

function reportReadFailure(error: unknown, operationId: string) {
  if (error instanceof ClassifiedsRequestError && error.serverReportedFailure) return;
  console.error(JSON.stringify({
    event: "ads.published_photo.read_failed", service: process.env.K_SERVICE ?? "next",
    environment: process.env.NODE_ENV, release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome: "unexpected_failure", route: "/api/anuncios/[adId]/fotos/[imageId]",
    statusClass: "5xx", operationId, cause: error instanceof Error ? error.name : "UnknownError",
  }));
}

export async function GET(request: Request, { params }: { params: Promise<{ adId: string; imageId: string }> }) {
  const { adId, imageId } = await params;
  if (!publicationIdentifier.safeParse(adId).success || !publicationIdentifier.safeParse(imageId).success) return new Response(null, { status: 404, headers });
  const width = requestedWidth(request);
  if (width !== undefined && !widths.has(width)) return new Response(null, { status: 400, headers });
  const operationId = crypto.randomUUID();
  try {
    const result = await readPublishedPhoto(adId, imageId, width, operationId, request.headers.get("accept") ?? undefined);
    if (!result) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(result.bytes), { headers: { ...headers, "Content-Type": result.mimeType } });
  }
  catch (error) {
    reportReadFailure(error, operationId);
    return new Response(null, { status: 503, headers: { ...headers, "X-Operation-Id": operationId } });
  }
}
