"use client";

import { MediaImage as MediaImageView, type MediaImageProps } from "@tudomacae/media/image";
import Image from "@/components/ui/image";

function NextMediaImage(props: MediaImageProps) {
  return <Image {...props} alt={props.alt} unoptimized />;
}
export function MediaImage(props: { alt: string; url: string }) {
  return <MediaImageView {...props} Image={NextMediaImage} />;
}
