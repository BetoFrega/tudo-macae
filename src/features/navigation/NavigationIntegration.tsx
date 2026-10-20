"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { SiteNavigationProvider } from "@tudomacae/site-layout/navigation";

// Header, rail and footer links appear on every page. vinext prefetches a link by
// rendering the whole destination, so prefetching them would multiply each visit's
// Worker renders; navigation fetches on click instead.
function ApplicationLink({ onClick, onMouseEnter, onTouchStart, ...props }: ComponentProps<"a"> & { href: string }) {
  return <Link {...props} prefetch={false} {...(onClick ? { onClick } : {})} {...(onMouseEnter ? { onMouseEnter } : {})} {...(onTouchStart ? { onTouchStart } : {})} />;
}

export function NavigationIntegration({ children }: { children: ReactNode }) {
  return <SiteNavigationProvider link={ApplicationLink} pathname="/">{children}</SiteNavigationProvider>;
}

// URL reads remain inside the header's existing Suspense boundaries for PPR.
export function ContextualNavigation({ children }: { children: ReactNode }) {
  return <SiteNavigationProvider link={ApplicationLink} pathname={usePathname()}>{children}</SiteNavigationProvider>;
}
