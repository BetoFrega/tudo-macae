import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { syncPendingPublicationImages } from "@/integrations/ads/publicationPhotos";
import { InvalidPhotoBytes, PhotoUploadTooLarge, readBoundedPhotoFormData } from "@/integrations/ads/use-cases/readBoundedPhotoFormData";
import { AdOperationError } from "@tudomacae/ads/operationError";
import { PhotoError } from "@tudomacae/classifieds-photos";
import { PendingPhotoConflict } from "@tudomacae/ads/syncPendingPublicationImages";
import { publicationIdentifier } from "@tudomacae/ads/validation";
import { isSameOriginMutation } from "@/lib/sameOriginMutation";
import { ClassifiedsRequestError } from "@tudomacae/classifieds-client/protocol";

const expectedFailureMessages = ["Publicação pendente não encontrada nesta conta.", "Fotos duplicadas.", "Escolha uma foto válida de até 1 MB para continuar.", "Use uma foto JPEG, PNG, WebP ou GIF para continuar.", "Esta foto mudou em outra sessão. Recarregue a página e tente novamente.", "Esta foto está sendo limpa. Selecione-a novamente e tente salvar.", "Identificador de publicação inválido para fotos.", "O envio desta foto expirou. Selecione-a novamente e tente salvar."];

function operationHeaders(operationId: string) {
  return { "Cache-Control": "no-store", "X-Operation-Id": operationId };
}

function adOperationStatus(code: AdOperationError["code"]) {
  if (code === "forbidden") return 403;
  return code === "not-found" ? 404 : 409;
}

function photoErrorStatus(code: PhotoError["code"]) {
  if (code === "forbidden") return 403;
  return ["conflict", "retired"].includes(code) ? 409 : 400;
}

function typedFailureResponse(error: unknown, operationId: string): Response | null {
  if (error instanceof AdOperationError) return Response.json({ error: error.message }, { status: adOperationStatus(error.code), headers: operationHeaders(operationId) });
  if (error instanceof PhotoError && error.code !== "unavailable") return Response.json({ error: error.message }, { status: photoErrorStatus(error.code), headers: operationHeaders(operationId) });
  if (error instanceof PendingPhotoConflict) return Response.json({ error: error.message }, { status: 409, headers: operationHeaders(operationId) });
  if (error instanceof PhotoUploadTooLarge) return Response.json({ error: "Escolha até três fotos de 1 MB." }, { status: 413 });
  if (error instanceof InvalidPhotoBytes) return Response.json({ error: "Escolha uma foto JPEG, PNG, WebP ou GIF válida de até 1 MB." }, { status: 400 });
  return null;
}

function isExpectedFailure(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return error.name === "ZodError" || error.name === "SyntaxError" || expectedFailureMessages.includes(error.message);
}

function reportUnexpectedFailure(error: unknown, operationId: string) {
  if (error instanceof ClassifiedsRequestError && error.serverReportedFailure) return;
  console.error(JSON.stringify({
    event: "ads.pending_photo.sync_failed", service: process.env.K_SERVICE ?? "next",
    environment: process.env.NODE_ENV, release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome: "unexpected_failure", route: "/api/publicacoes-pendentes/[publicationId]/fotos",
    statusClass: "5xx", operationId,
    cause: error instanceof Error ? error.name : "UnknownError",
  }));
}

export async function POST(request: Request, { params }: { params: Promise<{ publicationId: string }> }) {
  const operationId = crypto.randomUUID();
  const { publicationId } = await params;
  if (!isSameOriginMutation(request)) return Response.json({ error: "Solicitação inválida." }, { status: 403 });
  if (!publicationIdentifier.safeParse(publicationId).success) return Response.json({ error: "Publicação inválida." }, { status: 400 });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
    const images = await syncPendingPublicationImages(user.uid, publicationId, await readBoundedPhotoFormData(request), operationId);
    return Response.json({ images }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) {
    const typedFailure = typedFailureResponse(error, operationId);
    if (typedFailure) return typedFailure;
    if (isExpectedFailure(error)) return Response.json({ error: error.message }, { status: 400, headers: operationHeaders(operationId) });
    reportUnexpectedFailure(error, operationId);
    return Response.json({ error: "Não foi possível salvar as fotos. Tente novamente." }, { status: 503, headers: operationHeaders(operationId) });
  }
}
