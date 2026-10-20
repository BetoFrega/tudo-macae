"use client";
import { useMediaIntegrations } from "./MediaProvider";
import { Button } from "@tudomacae/react-primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@tudomacae/react-primitives/card";
import { MediaFigure } from "./MediaFigure";
import { MediaImage } from "./MediaImage";
import { MediaEditDialog } from "./MediaEditDialog";
import { mediaOriginLabels } from "../mediaForm";
import type { MediaOption } from "../../options";
import { mediaKindLabels } from "@tudomacae/media/model";

export function MediaLibraryCatalog({
  media,
  cursor,
  nextCursor,
  basePath,
  requiresCorrectionReason,
}: {
  media: MediaOption[];
  cursor?: string;
  nextCursor?: string;
  basePath: string;
  requiresCorrectionReason: boolean;
}) {
  const { Link, Image } = useMediaIntegrations();
  return (
    <section className="space-y-4">
      <h3 className="text-xl font-semibold">Mídias no acervo</h3>
      {media.length === 0
        ? <p className="text-sm text-muted-foreground">{cursor ? "Nenhuma mídia nesta página." : "Nenhuma mídia cadastrada ainda."}</p>
        : (
            <div className="
              grid gap-4
              sm:grid-cols-2
              lg:grid-cols-3
            "
            >
              {media.map(item => (
                <Card key={item.id} className="gap-0 overflow-hidden py-0" data-testid="media-card">
                  <MediaFigure caption={item.caption} credit={item.provenance.credit}>
                    <MediaImage Image={Image} url={item.url} alt={item.alt} />
                  </MediaFigure>
                  <CardHeader className="gap-2 py-4">
                    <div className="
                      flex flex-wrap items-start justify-between gap-2
                    "
                    >
                      <CardTitle className="text-base">{mediaKindLabels[item.kind]}</CardTitle>
                      <MediaEditDialog
                        media={item}
                        requiresCorrectionReason={requiresCorrectionReason}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="
                    space-y-1 pb-4 text-sm text-muted-foreground
                  "
                  >
                    <p>
                      <span className="text-foreground">Procedência: </span>
                      {mediaOriginLabels[item.provenance.origin]}
                    </p>
                    <p>
                      <span className="text-foreground">Estado: </span>
                      {item.status === "staged" ? "Preparada" : "Ativa"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      <div className="flex flex-wrap gap-3">
        {cursor && <Button asChild variant="outline"><Link href={basePath}>Voltar ao início</Link></Button>}
        {nextCursor && (
          <Button asChild variant="outline">
            <Link href={`${basePath}?mediaCursor=${encodeURIComponent(nextCursor)}`}>Próxima página do acervo</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
