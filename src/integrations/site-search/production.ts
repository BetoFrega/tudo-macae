import { createSiteSearch, type SiteSearchFilter, type SiteSearchRecord, type SiteSearchResponse } from "@tudomacae/site-search/search";
import { createSiteSearchFlag, siteSearchDistinctId, siteSearchFlagKey } from "@tudomacae/site-search/flag";
import { createPostHogSiteSearchFlagEvaluation, createSiteSearchWorkerProvider } from "@tudomacae/site-search/providers";
import { metadataIdentityToken } from "./runtimeIdentity";

/** The origin AI Search crawls; results elsewhere are discarded. */
const crawledSiteOrigin = "https://www.tudomacae.com.br";
// AI Search took 0.6–6.4 s (median 3.5 s) on 2026-09-27 while reindexing; one
// deadline covers identity, the filtered search and its unfiltered retry.
const providerTimeoutMs = 15_000;

// Server-only overrides let a local stack point at a loopback provider; deployed
// runtimes use the PostHog project the browser already reports to.
const flagsOrigin = () => process.env.SITE_SEARCH_FLAGS_ORIGIN ?? process.env.NEXT_PUBLIC_POSTHOG_HOST;
const flagsToken = () => process.env.SITE_SEARCH_FLAGS_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

function operationalContext() {
  return {
    service: process.env.K_SERVICE ?? "next",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.K_REVISION ?? process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
    flag: siteSearchFlagKey,
  };
}

function traceFields(traceId: string | undefined) {
  if (!traceId) return {};
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  return {
    traceId,
    ...(project ? { "logging.googleapis.com/trace": `projects/${project}/traces/${traceId}` } : {}),
  };
}

function severityOf(outcome: SiteSearchRecord["outcome"]) {
  if (outcome === "results" || outcome === "empty") return "INFO";
  return outcome === "quota" ? "WARNING" : "ERROR";
}

const flag = createSiteSearchFlag({
  evaluate: createPostHogSiteSearchFlagEvaluation({
    origin: flagsOrigin(),
    projectToken: flagsToken(),
    fetch: (...args) => fetch(...args),
  }),
  now: Date.now,
  record: ({ failure }) => console.warn(JSON.stringify({
    severity: "WARNING",
    event: "site_search_flag",
    ...operationalContext(),
    outcome: "fallback",
    failure,
  })),
});

/** Cookie holding the browser's PostHog identity, when analytics is configured. */
export function siteSearchIdentityCookieName() {
  const token = flagsToken();
  return token ? `ph_${token}_posthog` : undefined;
}

/** Missing, failed or malformed evaluations keep the established experience. */
export function siteSearchEnabled(identityCookie: string | undefined) {
  return flag.enabled(siteSearchDistinctId(identityCookie));
}

/** Records the outcome once, at the boundary that answers the visitor. */
export function searchSite(
  query: string,
  filter: SiteSearchFilter | undefined,
  request: { traceId?: string } = {},
): Promise<SiteSearchResponse> {
  return createSiteSearch({
    siteOrigin: crawledSiteOrigin,
    provider: createSiteSearchWorkerProvider({
      origin: process.env.SITE_SEARCH_URL,
      fetch: (...args) => fetch(...args),
      identityToken: metadataIdentityToken,
      timeoutMs: providerTimeoutMs,
      correlationId: () => request.traceId,
    }),
    now: () => performance.now(),
    record: (record) => {
      const severity = severityOf(record.outcome);
      const line = JSON.stringify({
        severity,
        event: "site_search",
        ...operationalContext(),
        route: "/busca",
        outcome: record.outcome,
        filter: record.filter,
        resultCount: record.resultCount,
        durationMs: Math.round(record.durationMs),
        ...(record.providerDurationMs === undefined ? {} : { providerDurationMs: Math.round(record.providerDurationMs) }),
        ...traceFields(request.traceId),
      });
      if (severity === "INFO") console.info(line);
      else console.error(line);
    },
  }).search(query, filter);
}
