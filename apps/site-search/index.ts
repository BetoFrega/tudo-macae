import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const maximumQueryLength = 200;
// Several chunks per page and the app-side type filter both consume results.
const maximumChunks = 50;
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5_000 });

type Outcome = "results" | "empty" | "quota" | "provider-error" | "invalid-request";

async function hasValidIdentity(request: Request, env: Env, keys: JWTVerifyGetKey) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 8192
    || !env.OIDC_AUDIENCE || !env.OIDC_SERVICE_ACCOUNT) return false;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, {
      algorithms: ["RS256"], audience: env.OIDC_AUDIENCE,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      requiredClaims: ["exp", "iat", "sub", "email"],
    });
    return payload.email === env.OIDC_SERVICE_ACCOUNT && payload.email_verified === true;
  }
  catch { return false; }
}

function json(status: number, value: unknown) {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store" } });
}

// Mirrors SiteSearchResultType; the custom metadata field is `search_result_type`.
const resultTypes = new Set(["business", "ad", "category", "subcategory", "article", "editorial-section", "topic", "page"]);

async function readRequest(request: Request) {
  try {
    const body = await request.json() as { query?: unknown; types?: unknown };
    if (typeof body.query !== "string") return undefined;
    const query = body.query.replace(/\s+/gu, " ").trim();
    if (!query || query.length > maximumQueryLength) return undefined;
    if (body.types === undefined) return { query };
    if (!Array.isArray(body.types) || !body.types.length
      || !body.types.every(type => typeof type === "string" && resultTypes.has(type))) return undefined;
    return { query, types: body.types as string[] };
  }
  catch { return undefined; }
}

/** AI Search reports exhausted free-tier allowances as errors, without a stable code. */
function isQuotaFailure(error: unknown) {
  return error instanceof Error && /quota|rate.?limit|too many requests|\b429\b|neurons/iu.test(error.message);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// One event per answered search: outcome, sizes and latency, never the query, keys or text.
function logSearch(request: Request, env: Env, fields: { outcome: Outcome; status: number; chunkCount?: number; durationMs?: number }) {
  const correlationId = request.headers.get("x-request-id");
  const line = JSON.stringify({
    event: "site_search_worker", service: "cloudflare-worker", environment: "production",
    release: env.WORKER_VERSION?.id ?? "unknown", route: "/search",
    statusClass: `${Math.floor(fields.status / 100)}xx`, ...fields,
    ...(correlationId && /^[a-zA-Z0-9_-]{1,128}$/u.test(correlationId) ? { correlationId } : {}),
  });
  if (fields.status >= 500 || fields.outcome === "quota") console.error(line);
  else console.log(line);
}

type SearchRequest = NonNullable<Awaited<ReturnType<typeof readRequest>>>;

function searchIndex(env: Env, searchRequest: SearchRequest) {
  // Retrieval only: no query rewriting, reranking or generation, which spend Workers AI allowance.
  return env.AI_SEARCH.search({
    query: searchRequest.query,
    ai_search_options: {
      retrieval: {
        retrieval_type: "hybrid",
        max_num_results: maximumChunks,
        return_on_failure: false,
        ...(searchRequest.types ? { filters: { search_result_type: { $in: searchRequest.types } } } : {}),
      },
      query_rewrite: { enabled: false },
      reranking: { enabled: false },
    },
  });
}

export function createSiteSearchWorker(dependencies: { keys?: JWTVerifyGetKey; now?: () => number; boundRenderer?: boolean } = {}) {
  const now = dependencies.now ?? (() => performance.now());
  let lastAuthorizationSignalAt = -Infinity;
  // Unauthenticated traffic cannot create unbounded diagnostic logs.
  function signalUnauthorized(env: Env) {
    const at = Date.now();
    if (at - lastAuthorizationSignalAt < 60_000) return;
    lastAuthorizationSignalAt = at;
    console.error(JSON.stringify({ event: "site_search_worker", service: "cloudflare-worker", environment: "production",
      release: env.WORKER_VERSION?.id ?? "unknown", outcome: "unauthorized", statusClass: "4xx" }));
  }
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (!dependencies.boundRenderer && !await hasValidIdentity(request, env, dependencies.keys ?? googleKeys)) {
        signalUnauthorized(env);
        return json(401, { error: "unauthorized" });
      }
      if (request.method !== "POST" || new URL(request.url).pathname !== "/search") return json(404, { error: "not_found" });

      const searchRequest = await readRequest(request);
      if (!searchRequest) {
        logSearch(request, env, { outcome: "invalid-request", status: 400 });
        return json(400, { error: "invalid_query" });
      }

      const startedAt = now();
      try {
        const response = await searchIndex(env, searchRequest);
        const durationMs = Math.round(now() - startedAt);
        const chunks = response.chunks.flatMap((chunk) => {
          const key = text(chunk.item.key);
          if (!key || typeof chunk.text !== "string") return [];
          const title = text(chunk.item.metadata?.title);
          return [{ key, text: chunk.text, ...(title ? { title } : {}) }];
        });
        logSearch(request, env, { outcome: chunks.length ? "results" : "empty", status: 200, chunkCount: chunks.length, durationMs });
        return json(200, { chunks, durationMs });
      }
      catch (error) {
        const durationMs = Math.round(now() - startedAt);
        if (isQuotaFailure(error)) {
          logSearch(request, env, { outcome: "quota", status: 429, durationMs });
          return json(429, { error: "quota" });
        }
        logSearch(request, env, { outcome: "provider-error", status: 502, durationMs });
        return json(502, { error: "provider" });
      }
    },
  };
}

const worker = createSiteSearchWorker();
/** Serves the `WebRenderer` entrypoint in `entry.ts`: the service binding already proves the caller. */
export const serveBoundRenderer = createSiteSearchWorker({ boundRenderer: true }).fetch;

export default { fetch: worker.fetch } satisfies ExportedHandler<Env>;
