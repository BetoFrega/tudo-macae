"use client";

import type { ComponentProps } from "react";
import { SiteSearchFilters as SearchComponent } from "@tudomacae/site-search/ui";
import { SearchIntegration } from "@/integrations/site-search/ui";

export function SiteSearchFilters(props: ComponentProps<typeof SearchComponent>) {
  return <SearchIntegration><SearchComponent {...props} /></SearchIntegration>;
}
