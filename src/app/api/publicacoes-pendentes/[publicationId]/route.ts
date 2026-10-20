import { AdOperationError } from "@tudomacae/ads/operationError";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { readPublication } from "@/integrations/ads/publication";
import { publicationIdentifier } from "@tudomacae/ads/validation";
import { getUserAdvertiserProfilesUseCase } from "@/packages/classifieds-api";

const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

function isHiddenPublication(error: unknown) {
  if (error instanceof AdOperationError && ["forbidden", "not-found"].includes(error.code)) return true;
  return error instanceof Error && ["Publicação não encontrada nesta conta.", "Este anúncio não tem uma publicação pendente."].includes(error.message);
}

function reportReadFailure(error: unknown, operationId: string) {
  console.error(JSON.stringify({
    event: "ads.pending_publication.read_failed", service: process.env.K_SERVICE ?? "next",
    environment: process.env.NODE_ENV, release: process.env.K_REVISION ?? process.env.GITHUB_SHA ?? "unknown",
    outcome: "unexpected_failure", route: "/api/publicacoes-pendentes/[publicationId]", statusClass: "5xx", operationId,
    cause: error instanceof Error ? error.name : "UnknownError",
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ publicationId: string }> }) {
  const operationId = crypto.randomUUID();
  const headers = { ...privateHeaders, "X-Operation-Id": operationId };
  const { publicationId } = await params;
  if (!publicationIdentifier.safeParse(publicationId).success) return Response.json({ error: "Publicação não encontrada nesta conta." }, { status: 404, headers });
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Entre na sua conta para continuar." }, { status: 401, headers });
    const publication = await readPublication(user.uid, publicationId);
    if (!publication || publication.deleting) return Response.json({ error: "Publicação não encontrada nesta conta." }, { status: 404, headers });
    const profiles = await getUserAdvertiserProfilesUseCase(user.uid);
    const images = (publication.images ?? []).map(image => ({ ...image, url: `/api/publicacoes-pendentes/${encodeURIComponent(publication.id)}/fotos/${encodeURIComponent(image.id)}` }));
    return Response.json({ publication: { ...publication, images }, profiles }, { headers });
  }
  catch (error) {
    if (isHiddenPublication(error)) {
      return Response.json({ error: "Publicação não encontrada nesta conta." }, { status: 404, headers });
    }
    reportReadFailure(error, operationId);
    return Response.json({ error: "Não foi possível retomar a publicação. Tente novamente." }, { status: 503, headers });
  }
}
