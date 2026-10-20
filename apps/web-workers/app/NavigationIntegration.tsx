"use client";

import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { SiteNavigationProvider } from "@tudomacae/site-layout/navigation";

// Document requests let the origin router choose the owner of the destination.
function DocumentLink(props: ComponentProps<"a"> & { href: string }) {
  return <a {...props} />;
}

export function NavigationIntegration({ children }: { children: ReactNode }) {
  return <SiteNavigationProvider link={DocumentLink} pathname={usePathname()}>{children}</SiteNavigationProvider>;
}
