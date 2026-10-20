import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { SiteSearchForm } from "@/components/site-search/SiteSearchForm";
import { SiteSearchResults } from "@/components/site-search/SiteSearchResults";
import { SiteSearchFilters } from "@/components/site-search/SiteSearchFilters";
import { SiteSearchLoading } from "@/components/site-search/SiteSearchLoading";
import { normalizeSiteSearchFilter, normalizeSiteSearchQuery } from "@tudomacae/site-search/search";
import { searchSite } from "@/integrations/site-search/production";

// The title never carries the query: PostHog reports it on every pageview. The
// referrer policy keeps `?q=` out of the Referer that result clicks send onward.
export const metadata: Metadata = {
  title: "Buscar | Tudo Macaé",
  referrer: "origin",
  robots: { index: false, follow: true },
};

export default async function SiteSearchPage({ searchParams }: PageProps<"/busca">) {
  // `src/proxy.ts` answers 404 before rendering when the release flag is off.
  await connection();

  const parameters = await searchParams;
  const query = normalizeSiteSearchQuery(parameters.q);
  const filter = normalizeSiteSearchFilter(parameters.tipo);

  return (
    <main className="
      container mx-auto max-w-3xl px-4 py-6
      sm:py-10
    "
    >
      <h1 className="
        text-3xl font-bold tracking-tight text-balance
        sm:text-4xl
      "
      >
        Buscar no Tudo Macaé
      </h1>
      <p className="mt-2 text-muted-foreground">
        Encontre negócios, anúncios e categorias pelo nome ou descrevendo o que precisa.
      </p>
      <SiteSearchForm
        key={`${query ?? ""}:${filter ?? ""}`}
        surface="page"
        className="mt-5"
        {...(query ? { defaultQuery: query } : {})}
        {...(filter ? { filter } : {})}
      />
      {query && <SiteSearchFilters query={query} {...(filter ? { filter } : {})} />}
      {query && (
        <Suspense
          key={`${query}:${filter ?? "all"}`}
          fallback={<SiteSearchLoading />}
        >
          <SiteSearchResultsContent query={query} {...(filter ? { filter } : {})} />
        </Suspense>
      )}
    </main>
  );
}

function traceIdOf(value: string | null) {
  return value?.match(/^([a-f0-9]{32})\//u)?.[1];
}

async function SiteSearchResultsContent({ query, filter }: {
  query: string;
  filter?: NonNullable<ReturnType<typeof normalizeSiteSearchFilter>>;
}) {
  const traceId = traceIdOf((await headers()).get("x-cloud-trace-context"));
  const response = await searchSite(query, filter, traceId ? { traceId } : {});

  return <SiteSearchResults query={query} response={response} {...(filter ? { filter } : {})} />;
}
