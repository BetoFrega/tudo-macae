import { presentSiteSearchChunks } from "./presentation";

export const siteSearchQueryMaxLength = 200;

export type SiteSearchFailure = "timeout" | "unavailable" | "provider-error" | "quota";
export type SiteSearchOutcome = "results" | "empty" | SiteSearchFailure;

/** Glossary terms: Classifieds (business, ad, category, subcategory), Editorial (article, editorial-section, topic). */
export type SiteSearchResultType
  = | "business"
    | "ad"
    | "category"
    | "subcategory"
    | "article"
    | "editorial-section"
    | "topic"
    | "page";

/** Visitor-facing groups of result types. */
export const siteSearchFilters = {
  businesses: ["business"],
  ads: ["ad"],
  articles: [],
  navigation: ["category", "subcategory", "page"],
} as const satisfies Record<string, readonly SiteSearchResultType[]>;

export type SiteSearchFilter = keyof typeof siteSearchFilters;

/** Custom metadata field the index extracts from each page's `<meta name>`. */
export const siteSearchResultTypeField = "search_result_type";

/** `Metadata.other` entry declaring the page's result type to the index. */
export function siteSearchResultTypeMeta(type: SiteSearchResultType) {
  return { [siteSearchResultTypeField]: type };
}

/** Values of the Portuguese `tipo` URL parameter. */
const filterParameters: Record<SiteSearchFilter, string> = {
  businesses: "negocios",
  ads: "anuncios",
  articles: "noticias",
  navigation: "navegacao",
};

export function siteSearchFilterParameter(filter: SiteSearchFilter) {
  return filterParameters[filter];
}

export interface SiteSearchResult {
  title: string;
  type: SiteSearchResultType;
  /** Site-relative path, so the result opens on whichever origin serves the search. */
  path: string;
  snippet: string;
}

export type SiteSearchResponse
  = | { outcome: "results"; results: SiteSearchResult[] }
    | { outcome: "empty" }
    | { outcome: SiteSearchFailure };

export interface SiteSearchChunk {
  /** Absolute URL of the crawled page. */
  key: string;
  title?: string;
  text: string;
}

export type SiteSearchProviderReply
  = | { status: "ok"; chunks: SiteSearchChunk[]; providerDurationMs?: number }
    | { status: SiteSearchFailure };

export interface SiteSearchProvider {
  /** `types` asks the index to keep only pages declaring those result types. */
  search(query: string, types?: readonly SiteSearchResultType[]): Promise<SiteSearchProviderReply>;
}

/** Bounded operational facts: never the query, a result or a URL. */
export interface SiteSearchRecord {
  outcome: SiteSearchOutcome;
  filter: SiteSearchFilter | "all";
  resultCount: number;
  durationMs: number;
  providerDurationMs?: number;
}

export function normalizeSiteSearchQuery(input: unknown): string | undefined {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value !== "string") return undefined;
  const query = value.replace(/\s+/gu, " ").trim().slice(0, siteSearchQueryMaxLength).trim();
  return query || undefined;
}

/** Reads the `tipo` URL parameter; unknown values mean every type. */
export function normalizeSiteSearchFilter(input: unknown): SiteSearchFilter | undefined {
  const value = Array.isArray(input) ? input[0] : input;
  return (Object.keys(filterParameters) as SiteSearchFilter[])
    .find(filter => filterParameters[filter] === value);
}

const unfilteredTypes: readonly SiteSearchResultType[] = ["business", "ad", "category", "subcategory", "page"];

function filterTypes(filter: SiteSearchFilter | undefined): readonly SiteSearchResultType[] {
  if (filter === "articles") return [];
  return filter ? siteSearchFilters[filter] : unfilteredTypes;
}

async function askProvider(
  provider: SiteSearchProvider,
  query: string,
  types?: readonly SiteSearchResultType[],
): Promise<SiteSearchProviderReply> {
  try {
    return await (types ? provider.search(query, types) : provider.search(query));
  }
  catch {
    return { status: "unavailable" };
  }
}

function addDurations(first: number | undefined, second: number | undefined) {
  return second === undefined ? first : (first ?? 0) + second;
}

type SiteSearchAnswer
  = | { status: "ok"; results: SiteSearchResult[]; providerDurationMs: number | undefined }
    | { status: SiteSearchFailure };

export function createSiteSearch(dependencies: {
  /** Origin the index crawls; pages elsewhere are never presented. */
  siteOrigin: string;
  provider: SiteSearchProvider;
  now(): number;
  record(record: SiteSearchRecord): void;
}) {
  async function searchTypes(
    query: string,
    types: readonly SiteSearchResultType[],
    filtered: boolean,
  ): Promise<SiteSearchAnswer> {
    const reply = await askProvider(dependencies.provider, query, types);
    if (reply.status !== "ok") return reply;
    const results = presentSiteSearchChunks(reply.chunks, dependencies.siteOrigin, types);
    // Pages indexed before they declared their type never match the provider
    // filter; an empty filtered answer is repeated unfiltered and filtered here.
    if (!filtered || results.length) {
      return { status: "ok", results, providerDurationMs: reply.providerDurationMs };
    }
    const retry = await askProvider(dependencies.provider, query);
    if (retry.status !== "ok") return retry;
    return {
      status: "ok",
      results: presentSiteSearchChunks(retry.chunks, dependencies.siteOrigin, types),
      providerDurationMs: addDurations(reply.providerDurationMs, retry.providerDurationMs),
    };
  }

  return {
    async search(query: string, filter?: SiteSearchFilter): Promise<SiteSearchResponse> {
      const recordedFilter = filter ?? "all";
      const types = filterTypes(filter);
      const startedAt = dependencies.now();
      if (!types.length) {
        dependencies.record({ outcome: "empty", filter: recordedFilter, resultCount: 0, durationMs: dependencies.now() - startedAt });
        return { outcome: "empty" };
      }
      const answer = await searchTypes(query, types, filter !== undefined);
      const durationMs = dependencies.now() - startedAt;

      if (answer.status !== "ok") {
        dependencies.record({ outcome: answer.status, filter: recordedFilter, resultCount: 0, durationMs });
        return { outcome: answer.status };
      }

      const { results, providerDurationMs } = answer;
      const outcome = results.length ? "results" : "empty";
      dependencies.record({
        outcome,
        filter: recordedFilter,
        resultCount: results.length,
        durationMs,
        ...(providerDurationMs === undefined ? {} : { providerDurationMs }),
      });
      return results.length ? { outcome: "results", results } : { outcome: "empty" };
    },
  };
}
