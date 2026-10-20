"use client";

import { createContext, useContext } from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";

interface SiteNavigation {
  link: ComponentType<ComponentProps<"a"> & { href: string }>;
  pathname: string;
}

const Navigation = createContext<SiteNavigation | null>(null);

export function SiteNavigationProvider({ children, ...integration }: SiteNavigation & { children: ReactNode }) {
  return <Navigation.Provider value={integration}>{children}</Navigation.Provider>;
}

export function useSiteNavigation() {
  const integration = useContext(Navigation);
  if (!integration) throw new Error("SiteNavigationProvider is required");
  return integration;
}
