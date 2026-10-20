import type { SiteSearchFilter, SiteSearchOutcome, SiteSearchResultType } from "../../search";

export type SiteSearchSurface = "header" | "page";

// Properties are bounded values only: never the query, a snippet or a URL.
export function siteSearchSubmittedEvent(surface: SiteSearchSurface) {
  return { name: "site_search_submitted", properties: { source_surface: surface } } as const;
}

export function siteSearchCompletedEvent(outcome: SiteSearchOutcome, resultCount: number, filter: SiteSearchFilter | undefined) {
  return {
    name: "site_search_completed",
    properties: { outcome, result_count: resultCount, type_filter: filter ?? "all" },
  } as const;
}

export function siteSearchResultClickedEvent(position: number, resultType: SiteSearchResultType, filter: SiteSearchFilter | undefined) {
  return {
    name: "site_search_result_clicked",
    properties: { position, result_type: resultType, type_filter: filter ?? "all" },
  } as const;
}
