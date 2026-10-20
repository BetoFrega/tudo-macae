"use client";

import Link from "next/link";
import posthog from "posthog-js";
import type { ReactNode } from "react";
import { SiteSearchProvider, type SiteSearchCapture, type SiteSearchLink } from "@tudomacae/site-search/ui";

const SearchLink: SiteSearchLink = ({ onClick, onMouseEnter, onTouchStart, ...props }) => {
  if (props.href === "/termos-e-condicoes") return <a {...props} onClick={onClick} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart} />;
  return <Link {...props} {...(onClick ? { onClick } : {})} {...(onMouseEnter ? { onMouseEnter } : {})} {...(onTouchStart ? { onTouchStart } : {})} />;
};
const capture: SiteSearchCapture = (name, properties) => posthog.capture(name, properties);

export function SearchIntegration({ children }: { children: ReactNode }) {
  return <SiteSearchProvider link={SearchLink} capture={capture}>{children}</SiteSearchProvider>;
}
