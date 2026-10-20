"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@tudomacae/react-primitives/avatar";
import type { IdentityImage } from "./rendering";

interface IdentityAvatarProps {
  Image: IdentityImage;
  src?: string | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  fallback: ReactNode;
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function LoadingIdentityImage({
  Image,
  src,
  alt,
  width,
  height,
  imageClassName,
  fallbackClassName,
  fallback,
}: Omit<IdentityAvatarProps, "className"> & { src: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <Image
        src={src}
        alt={alt}
        aria-hidden={!loaded}
        width={width}
        height={height}
        className={classNames("absolute inset-0", imageClassName)}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.complete && image.naturalWidth > 0) setLoaded(true);
        }}
        onError={() => setLoaded(false)}
      />
      {!loaded && (
        <AvatarFallback className={classNames("absolute inset-0", fallbackClassName)}>
          {fallback}
        </AvatarFallback>
      )}
    </>
  );
}

export function IdentityAvatar({
  Image,
  src,
  alt,
  width,
  height,
  className,
  imageClassName,
  fallbackClassName,
  fallback,
}: IdentityAvatarProps) {
  return (
    <Avatar className={className}>
      {src
        ? (
            <LoadingIdentityImage
              key={src}
              Image={Image}
              src={src}
              alt={alt}
              width={width}
              height={height}
              {...(imageClassName !== undefined ? { imageClassName } : {})}
              {...(fallbackClassName !== undefined ? { fallbackClassName } : {})}
              fallback={fallback}
            />
          )
        : (
            <AvatarFallback className={classNames("absolute inset-0", fallbackClassName)}>
              {fallback}
            </AvatarFallback>
          )}
    </Avatar>
  );
}
