"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ComponentProps, type MouseEvent } from "react";
import { IdentityAppLink } from "@/integrations/advertiser-identity/rendering";
import type { IdentityLink } from "@tudomacae/advertiser-identity/presentation";

type PendingBusinessNavigation = {
  sourcePath: string;
  businessId: string;
};

let pendingBusinessNavigation: PendingBusinessNavigation | null = null;

function businessIdFromPathname(pathname: string) {
  return pathname.match(/^\/negocio\/([^/]+)\/[^/]+$/u)?.[1] ?? null;
}

function isUnmodifiedPrimaryActivation(event: MouseEvent<HTMLAnchorElement>) {
  return event.detail === 0
    && event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export const BusinessDirectoryFocusLink: IdentityLink = (props: ComponentProps<typeof IdentityAppLink>) => {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);

    if (window.location.pathname !== "/negocios") return;
    if (event.defaultPrevented || !isUnmodifiedPrimaryActivation(event)) {
      pendingBusinessNavigation = null;
      return;
    }

    const destination = new URL(props.href, window.location.href);
    const businessId = destination.origin === window.location.origin
      ? businessIdFromPathname(destination.pathname)
      : null;
    pendingBusinessNavigation = businessId
      ? { sourcePath: window.location.pathname, businessId }
      : null;
  };

  return <IdentityAppLink {...props} onClick={onClick} />;
};

/**
 * Mounted once in the root layout so it survives every route change. A pending
 * intent stays alive only while the route is its source directory or a path of
 * its Business (a slug redirect keeps the ID); any other committed route means
 * the navigation was abandoned, so a later visit to that Business must not
 * receive the stale focus.
 */
export function BusinessNavigationFocusRouteObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const pending = pendingBusinessNavigation;
    if (!pending) return;
    if (pathname === pending.sourcePath) return;
    if (businessIdFromPathname(pathname) === pending.businessId) return;
    pendingBusinessNavigation = null;
  }, [pathname]);

  return null;
}

export function BusinessNavigationFocusHeading({ href, title }: { href: string; title: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const destination = new URL(href, window.location.href);
    const pending = pendingBusinessNavigation;
    if (!pending) return;

    const currentBusinessId = businessIdFromPathname(window.location.pathname);
    if (currentBusinessId !== pending.businessId) {
      if (window.location.pathname !== pending.sourcePath) pendingBusinessNavigation = null;
      return;
    }

    const shouldFocusDestination = destination.origin === window.location.origin
      && businessIdFromPathname(destination.pathname) === pending.businessId;
    pendingBusinessNavigation = null;
    if (shouldFocusDestination) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [href]);

  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="
        text-4xl font-bold tracking-tight text-balance
        focus-visible:outline-2 focus-visible:outline-offset-4
        focus-visible:outline-primary
        sm:text-5xl
      "
    >
      {title}
    </h1>
  );
}
