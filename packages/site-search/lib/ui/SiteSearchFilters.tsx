"use client";

import { useSiteSearchIntegration } from "./integration";
import { siteSearchFilterParameter, type SiteSearchFilter } from "../../search";

const filters: Array<{ label: string; filter?: SiteSearchFilter }> = [
  { label: "Tudo" },
  { label: "Negócios", filter: "businesses" },
  { label: "Anúncios", filter: "ads" },
  { label: "Categorias e páginas", filter: "navigation" },
];

function hrefFor(query: string, filter: SiteSearchFilter | undefined) {
  const parameters = new URLSearchParams({ q: query });
  if (filter) parameters.set("tipo", siteSearchFilterParameter(filter));
  return `/busca?${parameters.toString()}`;
}

/** Links carry the query, so `ph-no-capture` keeps their addresses out of autocapture and replay. */
export function SiteSearchFilters({ query, filter }: { query: string; filter?: SiteSearchFilter }) {
  const { link: Link } = useSiteSearchIntegration();
  return (
    <nav aria-label="Filtrar por tipo" className="ph-no-capture mt-5">
      <ul className="flex flex-wrap gap-2">
        {filters.map(option => (
          <li key={option.label}>
            <Link
              href={hrefFor(query, option.filter)}
              aria-current={option.filter === filter ? "page" : undefined}
              className="
                inline-flex min-h-11 items-center rounded-full border px-4
                text-sm font-medium
                hover:bg-muted
                focus-visible:outline-2 focus-visible:outline-offset-2
                aria-[current=page]:border-primary
                aria-[current=page]:bg-primary
                aria-[current=page]:text-primary-foreground
              "
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
