import type { ComponentType, ComponentProps } from "react";

export type IdentityLink = ComponentType<ComponentProps<"a"> & { href: string }>;
export type IdentityImage = ComponentType<{
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  onLoad?: ComponentProps<"img">["onLoad"];
  onError?: ComponentProps<"img">["onError"];
}>;
