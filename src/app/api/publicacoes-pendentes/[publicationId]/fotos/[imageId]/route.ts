import { classifiedsPhotos, classifiedsPhotoCredential } from "@/packages/classifieds-api/photos";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { publicationIdentifier } from "@tudomacae/ads/validation";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";
import { PhotoError } from "@tudomacae/classifieds-photos";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Vary": "Cookie, Accept",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicationId: string; imageId: string }> },
) {
  const operationId = crypto.randomUUID();
  const { publicationId, imageId } = await params;
  if (!publicationIdentifier.safeParse(publicationId).success || !publicationIdentifier.safeParse(imageId).success) {
    return new Response(null, { status: 404, headers: privateHeaders });
  }
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = await getCurrentUser();
  }
  catch (error) {
    reportImageFailure("authentication_read_failed", operationId, error);
    return new Response(null, { status: 503, headers: { ...privateHeaders, "X-Operation-Id": operationId } });
  }
  if (!user) return new Response(null, { status: 404, headers: privateHeaders });
  try {
    return imageResponse(await classifiedsPhotos().readAd(publicationId, imageId, true, await classifiedsPhotoCredential(), operationId, undefined, request.headers.get("accept") ?? undefined));
  }
  catch (error) {
    if (isHiddenPublication(error)) return new Response(null, { status: 404, headers: privateHeaders });
    reportImageFailure("publication_read_failed", operationId, error);
    return new Response(null, { status: 503, headers: { ...privateHeaders, "X-Operation-Id": operationId } });
  }
}

function imageResponse(image: { bytes: Uint8Array; mimeType: string } | null) {
  if (!image) return new Response(null, { status: 404, headers: privateHeaders });
  return new Response(new Uint8Array(image.bytes), { headers: { ...privateHeaders, "Content-Type": image.mimeType } });
}

function isHiddenPublication(error: unknown) {
  if (error instanceof PhotoError && error.code === "forbidden") return true;
  return error instanceof Error && error.message.includes("não encontrada");
}

function reportImageFailure(outcome: string, operationId: string, error?: unknown) {
  if (error instanceof ClassifiedsRequestError && error.serverReportedFailure) return;
  console.error(JSON.stringify({
    event: "ads.pending_photo.read_failed",
    service: process.env.K_SERVICE ?? "next",
    environment: process.env.NODE_ENV,
    release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome,
    route: "/api/publicacoes-pendentes/[publicationId]/fotos/[imageId]",
    statusClass: "5xx",
    operationId,
    cause: error instanceof Error ? error.name : "UnknownError",
  }));
}
