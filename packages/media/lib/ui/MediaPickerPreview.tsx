"use client";

import { useMediaIntegrations } from "./MediaProvider";
import { useState } from "react";
import type { MediaOption } from "../../options";
import type { MediaKind } from "@tudomacae/media/model";
import { MediaPicker } from "./MediaPicker";
import { MediaFigure } from "./MediaFigure";

/** Keeps the choice local to the library preview. */
export function MediaPickerPreview({ kind, loadAction }: { kind: MediaKind; loadAction: (kind: MediaKind, cursor?: string) => Promise<import("../../options").MediaOptionsResult> }) {
  const { Image, create: createMedia, resolve: getMediaOptionById } = useMediaIntegrations();
  const [chosen, setChosen] = useState<MediaOption | null>(null);

  return (
    <div className="space-y-4">
      <MediaPicker
        kind={kind}
        loadAction={loadAction}
        resolveAction={getMediaOptionById}
        onCreateAction={createMedia}
        onSelectAction={setChosen}
      />

      {chosen
        ? (
            <div className="flex flex-wrap items-start gap-4" data-testid="media-picker-choice">
              <MediaFigure
                caption={chosen.caption}
                credit={chosen.provenance.credit}
                className="w-32 max-w-full"
                visualClassName={`
                relative aspect-video overflow-hidden rounded-md
                bg-muted
              `}
              >
                <Image
                  src={chosen.url}
                  alt={chosen.alt}
                  fill
                  loading="lazy"
                  className="object-cover"
                  sizes="128px"
                />
              </MediaFigure>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Mídia selecionada</p>
              </div>
            </div>
          )
        : (
            <p className="text-sm text-muted-foreground">
              Nenhuma mídia escolhida ainda.
            </p>
          )}
    </div>
  );
}
