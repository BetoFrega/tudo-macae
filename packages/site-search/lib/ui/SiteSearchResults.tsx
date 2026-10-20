"use client";

import { useSiteSearchIntegration } from "./integration";
import { useEffect } from "react";
import type { SiteSearchFilter, SiteSearchResponse, SiteSearchResultType } from "../../search";
import { siteSearchCompletedEvent, siteSearchResultClickedEvent } from "./siteSearchAnalytics";

const typeLabels: Record<SiteSearchResultType, string> = {
  "business": "Negócio",
  "ad": "Anúncio",
  "article": "Notícia",
  "category": "Categoria",
  "subcategory": "Subcategoria",
  "editorial-section": "Editoria",
  "topic": "Assunto",
  "page": "Página",
};

const failureMessages = {
  "timeout": "A busca demorou mais que o esperado.",
  "unavailable": "A busca está indisponível no momento.",
  "provider-error": "A busca não conseguiu responder agora.",
  "quota": "A busca atingiu o limite de uso por enquanto.",
} as const;

const linkClassName = `
  inline-flex min-h-11 items-center font-medium text-primary underline
  underline-offset-4
  hover:no-underline
  focus-visible:outline-2 focus-visible:outline-offset-2
`;

function ExistingNavigation() {
  const { link: Link } = useSiteSearchIntegration();
  return (
    <ul className="mt-3 flex flex-wrap gap-x-6">
      <li><Link href="/negocios" className={linkClassName}>Explorar o catálogo de negócios</Link></li>
      <li><Link href="/" className={linkClassName}>Ir para a página inicial</Link></li>
    </ul>
  );
}

/** Announces the outcome without moving focus; the heading stays navigable. */
function OutcomeStatus({ children }: { children: string }) {
  return <p role="status" className="sr-only">{children}</p>;
}

/**
 * `ph-no-capture` keeps the query echo, titles and snippets out of autocapture
 * and session replay; clicks report only position, type and filter.
 */
export function SiteSearchResults({ query, filter, response }: {
  query: string;
  filter?: SiteSearchFilter;
  response: SiteSearchResponse;
}) {
  const { link: Link, capture } = useSiteSearchIntegration();
  const resultCount = response.outcome === "results" ? response.results.length : 0;
  useEffect(() => {
    const event = siteSearchCompletedEvent(response.outcome, resultCount, filter);
    capture?.(event.name, event.properties);
  }, [capture, filter, response, resultCount]);

  if (response.outcome === "results") {
    return (
      <section
        aria-labelledby="site-search-results-title"
        className="ph-no-capture mt-8 min-h-124"
      >
        <h2
          id="site-search-results-title"
          className="text-xl font-semibold"
        >
          {resultCount === 1 ? "1 resultado" : `${resultCount} resultados`}
          {" para "}
          <q>{query}</q>
        </h2>
        <OutcomeStatus>{resultCount === 1 ? "1 resultado encontrado" : `${resultCount} resultados encontrados`}</OutcomeStatus>
        <ol className="mt-4 divide-y divide-border border-y">
          {response.results.map((result, index) => {
            const ResultLink = Link;
            return (
              <li key={result.path} className="py-4">
                <p className="
                  text-xs font-semibold tracking-wide text-muted-foreground
                  uppercase
                "
                >
                  {typeLabels[result.type]}
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  <ResultLink
                    href={result.path}
                    className={linkClassName}
                    onClick={() => {
                      const event = siteSearchResultClickedEvent(index + 1, result.type, filter);
                      capture?.(event.name, event.properties);
                    }}
                  >
                    {result.title}
                  </ResultLink>
                </h3>
                {result.snippet && (
                  <p className="
                    mt-1 leading-6 text-pretty text-muted-foreground
                  "
                  >
                    {result.snippet}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  if (response.outcome === "empty") {
    return (
      <section
        aria-labelledby="site-search-results-title"
        className="ph-no-capture mt-8 min-h-124"
      >
        <h2
          id="site-search-results-title"
          className="text-xl font-semibold"
        >
          Nada encontrado para
          {" "}
          <q>{query}</q>
        </h2>
        <OutcomeStatus>Nada encontrado</OutcomeStatus>
        <p className="mt-2 text-muted-foreground">
          Tente outras palavras, outro tipo ou explore pelas seções do site.
        </p>
        <ExistingNavigation />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="site-search-results-title"
      className="mt-8 min-h-124 rounded-xl border bg-muted/40 p-5"
    >
      <h2
        id="site-search-results-title"
        className="text-xl font-semibold"
      >
        Não foi possível buscar agora
      </h2>
      <OutcomeStatus>{`Não foi possível buscar agora. ${failureMessages[response.outcome]}`}</OutcomeStatus>
      <p className="mt-2 text-muted-foreground">
        {failureMessages[response.outcome]}
        {" "}
        Você pode tentar novamente em instantes ou continuar navegando:
      </p>
      <ExistingNavigation />
    </section>
  );
}
