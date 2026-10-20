"use client";

import type { ComponentProps } from "react";
import { SiteSearchForm as SearchComponent } from "@tudomacae/site-search/ui";
import { SearchIntegration } from "@/integrations/site-search/ui";

export function SiteSearchForm(props: ComponentProps<typeof SearchComponent>) {
  return <SearchIntegration><SearchComponent {...props} /></SearchIntegration>;
}
