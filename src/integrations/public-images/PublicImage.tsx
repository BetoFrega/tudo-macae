"use client";

import Image, { type ImageProps } from "next/image";

type PublicImageProps = Omit<ImageProps, "loader">;

export function publishedPendingPhotoLoader({ src, width }: { src: string; width: number }) {
  return `${src}?w=${width}`;
}

/** Classifieds routes resize through the API Worker; every other source renders as its original. */
function isClassifiedsPhotoRoute(src: ImageProps["src"]): src is string {
  return typeof src === "string" && (src.startsWith("/api/anuncios/") || src.startsWith("/api/classifieds/photos/public/"));
}

export function PublicImage({ alt, ...props }: PublicImageProps) {
  return isClassifiedsPhotoRoute(props.src)
    ? <Image loader={publishedPendingPhotoLoader} alt={alt} {...props} />
    : <Image alt={alt} {...props} unoptimized />;
}
