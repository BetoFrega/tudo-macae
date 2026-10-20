"use client";

import type { ComponentType } from "react";
import type { MediaImageProps } from "./MediaProvider";

export function MediaImage({ alt, url, Image }: { alt: string; url: string; Image: ComponentType<MediaImageProps> }) {
  return (
    <span className="
      relative block aspect-video w-full overflow-hidden bg-muted
    "
    >
      <Image src={url} alt={alt} fill loading="lazy" className="object-cover" sizes="(min-width: 768px) 370px, 95vw" />
    </span>
  );
}
