import { getMediaOptions } from "@/features/media/actions/getMediaOptions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMedia,
  getUnreferencedStagedMedia,
} from "@/features/media/actions/getMedia";
import { MediaForm } from "@/integrations/media/MediaComponents";
import { MediaLibraryCatalog } from "@/integrations/media/MediaComponents";
import { MediaPickerPreview } from "@/integrations/media/MediaComponents";

export default async function AdminMediaLibraryPage(
  { searchParams }: PageProps<"/admin/midias">,
) {
  const query = await searchParams;
  const mediaCursor = typeof query.mediaCursor === "string"
    ? query.mediaCursor
    : undefined;
  const reportCursor = typeof query.reportCursor === "string"
    ? query.reportCursor
    : undefined;
  const [libraryPage, unreferencedPage] = await Promise.all([
    getMedia(mediaCursor),
    getUnreferencedStagedMedia(reportCursor),
  ]);
  const library = libraryPage.media;
  const unreferenced = unreferencedPage.media;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Acervo de mídia</h2>

      <Card>
        <CardHeader>
          <CardTitle>Cadastrar mídia</CardTitle>
        </CardHeader>
        <CardContent>
          <MediaForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seletor de mídia</CardTitle>
          <CardDescription>
            O seletor que a redação usa para reaproveitar uma mídia do acervo.
            Aqui a escolha vale só nesta tela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MediaPickerPreview loadAction={getMediaOptions} kind="article-image" />
        </CardContent>
      </Card>

      <MediaLibraryCatalog
        media={library}
        {...(mediaCursor ? { cursor: mediaCursor } : {})}
        {...(libraryPage.nextCursor ? { nextCursor: libraryPage.nextCursor } : {})}
        basePath="/admin/midias"
        requiresCorrectionReason={libraryPage.requiresCorrectionReason}
      />

      <section className="space-y-2" data-testid="unreferenced-staged-media">
        <h3 className="text-xl font-semibold">Preparadas sem referência</h3>
        {unreferenced.length === 0
          ? (
              <p className="text-sm text-muted-foreground">
                {reportCursor
                  ? "Nenhuma mídia nesta página do relatório."
                  : "Nenhuma mídia nessa situação."}
              </p>
            )
          : (
              <ul className="list-disc pl-5 text-sm">
                {unreferenced.map(media => <li key={media.id}>{media.alt}</li>)}
              </ul>
            )}
        <div className="flex flex-wrap gap-3">
          {reportCursor && (
            <Button asChild variant="outline">
              <Link href="/admin/midias">Voltar ao início</Link>
            </Button>
          )}
          {unreferencedPage.nextCursor && (
            <Button asChild variant="outline">
              <Link
                href={`/admin/midias?reportCursor=${encodeURIComponent(unreferencedPage.nextCursor)}`}
              >
                Próxima página do relatório
              </Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
