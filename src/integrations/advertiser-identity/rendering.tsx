"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { IdentityLink, IdentityImage } from "@tudomacae/advertiser-identity/presentation";
import { PublicImage } from "@/integrations/public-images/PublicImage";

export const IdentityAppLink: IdentityLink = ({ className, onClick, onMouseEnter, onTouchStart, ...props }) => (
  <Link
    {...props}
    {...(className !== undefined ? { className } : {})}
    {...(onClick ? { onClick } : {})}
    {...(onMouseEnter ? { onMouseEnter } : {})}
    {...(onTouchStart ? { onTouchStart } : {})}
  />
);
export function IdentityPublicImage(props: ComponentProps<IdentityImage>) {
  return <PublicImage {...props} />;
}
