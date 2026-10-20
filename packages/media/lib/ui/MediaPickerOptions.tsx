"use client";

import { MediaVisual } from "./MediaFigure";
import { useMediaIntegrations } from "./MediaProvider";
import { mediaKindLabels } from "@tudomacae/media/model";
import type { MediaOption } from "../../options";

/** The acervo's medias as a grid of choosable cards. */
export function MediaPickerOptions({
  options,
  onChoose,
}: {
  options: MediaOption[];
  onChoose: (media: MediaOption) => void;
}) {
  const { Image } = useMediaIntegrations();

  return (
    <ul className={`
      grid gap-3
      sm:grid-cols-3
    `}
    >
      {options.map(media => (
        <li key={media.id}>
          <button
            type="button"
            onClick={() => onChoose(media)}
            data-testid="media-option"
            className={`
              w-full overflow-hidden rounded-md border text-left
              transition-colors
              hover:border-primary
            `}
          >
            <MediaVisual
              credit={media.provenance.credit}
              creditFocusable={false}
              className="relative aspect-video w-full bg-muted"
            >
              <Image
                src={media.url}
                alt={media.alt}
                fill
                loading="lazy"
                className="object-cover"
                sizes="(min-width: 640px) 200px, 90vw"
              />
            </MediaVisual>
            <span className="block p-2 text-xs wrap-anywhere">{media.caption || mediaKindLabels[media.kind]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
