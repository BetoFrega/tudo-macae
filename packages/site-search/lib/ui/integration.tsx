"use client";

import { createContext, useContext } from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { siteSearchSubmittedEvent, siteSearchCompletedEvent, siteSearchResultClickedEvent } from "./siteSearchAnalytics";

type SearchEvent = ReturnType<typeof siteSearchSubmittedEvent | typeof siteSearchCompletedEvent | typeof siteSearchResultClickedEvent>;
export type SiteSearchCapture = (name: SearchEvent["name"], properties: SearchEvent["properties"]) => void;
export type SiteSearchLink = ComponentType<ComponentProps<"a"> & { href: string }>;
interface Integration {
  link?: SiteSearchLink;
  capture?: SiteSearchCapture;
}
function DocumentLink(props: ComponentProps<"a"> & { href: string }) {
  return <a {...props} />;
}
const IntegrationContext = createContext<Integration>({});

export function SiteSearchProvider({ children, ...integration }: Integration & { children: ReactNode }) {
  return <IntegrationContext.Provider value={integration}>{children}</IntegrationContext.Provider>;
}

export function useSiteSearchIntegration() {
  const integration = useContext(IntegrationContext);
  return { ...integration, link: integration.link ?? DocumentLink };
}
