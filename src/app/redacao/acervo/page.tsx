import { getMediaOptions } from "@/features/media/actions/getMediaOptions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMedia } from "@/features/media/actions/getMedia";
import { MediaForm } from "@/integrations/media/MediaComponents";
import { MediaLibraryCatalog } from "@/integrations/media/MediaComponents";
import { MediaPickerPreview } from "@/integrations/media/MediaComponents";

export default async function NewsroomMediaLibraryPage(
  { searchParams }: PageProps<"/redacao/acervo">,
) {
  const query = await searchParams;
  const mediaCursor = typeof query.mediaCursor === "string" ? query.mediaCursor : undefined;
  const libraryPage = await getMedia(mediaCursor);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Acervo de mídia</h2>
      <Card>
        <CardHeader><CardTitle>Cadastrar mídia</CardTitle></CardHeader>
        <CardContent><MediaForm /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Seletor de mídia</CardTitle>
          <CardDescription>Escolha uma Mídia para reutilizar em um trabalho editorial.</CardDescription>
        </CardHeader>
        <CardContent><MediaPickerPreview loadAction={getMediaOptions} kind="article-image" /></CardContent>
      </Card>
      <MediaLibraryCatalog
        media={libraryPage.media}
        {...(mediaCursor ? { cursor: mediaCursor } : {})}
        {...(libraryPage.nextCursor ? { nextCursor: libraryPage.nextCursor } : {})}
        basePath="/redacao/acervo"
        requiresCorrectionReason={libraryPage.requiresCorrectionReason}
      />
    </div>
  );
}
