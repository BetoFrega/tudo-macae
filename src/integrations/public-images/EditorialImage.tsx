"use client";

import Image, { type ImageProps } from "next/image";
import { publicImagePresetWidths } from "@tudomacae/public-image-delivery/contract";
import { editorialImageTransformOrigin } from "./editorial";

function heroLoader({ src, width }: { src: string; width: number }) {
  const url = new URL(src);
  const selected = publicImagePresetWidths.editorial.hero.find(candidate => candidate >= width)
    ?? publicImagePresetWidths.editorial.hero.at(-1)!;
  url.pathname = url.pathname.replace(/\/hero\/\d+\//, `/hero/${selected}/`);
  return url.href;
}

export function EditorialImage(props: ImageProps) {
  const origin = editorialImageTransformOrigin();
  const transformed = origin && typeof props.src === "string"
    && props.src.startsWith(`${origin}/v1/editorial/hero/`);
  return <Image {...props} alt={props.alt} {...(transformed ? { loader: heroLoader, unoptimized: false } : { unoptimized: true })} />;
}
