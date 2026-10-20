import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

type PublicArticleSummary = {
  id: string;
  storyId: string;
  title: string;
  slug: string;
  mediaIds: string[];
  publishedAt: number;
  updatedAt: number;
};

const maximumSnapshotBytes = 1_500_000;
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5_000 });

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

function isArticleId(id: string) {
  return id.length > 0 && id.length <= 128 && !id.includes("/");
}

function isTimestamp(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isSummary(value: unknown): value is PublicArticleSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return Object.keys(summary).length === 7
    && ["id", "storyId", "title", "slug"].every(key => typeof summary[key] === "string")
    && isArticleId(summary.id as string)
    && (summary.storyId as string).length > 0 && (summary.slug as string).length > 0
    && Array.isArray(summary.mediaIds) && summary.mediaIds.every(id => typeof id === "string")
    && ["publishedAt", "updatedAt"].every(key => isTimestamp(summary[key]));
}

/** A tombstone carries only the version that retires the Article. */
function isTombstone(value: unknown): value is { updatedAt: number } {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).length === 1 && "updatedAt" in value && isTimestamp(value.updatedAt);
}

function json(status: number, value: unknown) {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store" } });
}

async function readBoundedBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumSnapshotBytes) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  }
  finally {
    reader.releaseLock();
  }
}

/** Reads a bounded JSON body, or answers why it cannot be read. */
async function readJsonBody(request: Request, errors: { invalid: string; tooLarge: string }): Promise<{ body: string; value: unknown } | Response> {
  let body: string | null;
  try {
    body = await readBoundedBody(request);
  }
  catch {
    return json(400, { error: errors.invalid });
  }
  if (body === null) return json(413, { error: errors.tooLarge });
  try {
    return { body, value: JSON.parse(body) };
  }
  catch {
    return json(400, { error: errors.invalid });
  }
}

async function replaceSnapshot(request: Request, env: Env) {
  const parsed = await readJsonBody(request, { invalid: "invalid_snapshot", tooLarge: "snapshot_too_large" });
  if (parsed instanceof Response) return parsed;
  const { body, value } = parsed;
  if (!Array.isArray(value) || !value.every(isSummary)) {
    return json(400, { error: "invalid_snapshot" });
  }
  if (new Set(value.map(summary => summary.id)).size !== value.length) {
    return json(400, { error: "duplicate_id" });
  }
  // One JSON-bound INSERT keeps the atomic replacement within D1's per-invocation query budget.
  const insert = env.DB.prepare(`
    INSERT INTO public_article_summaries (id, story_id, title, slug, media_ids, published_at, updated_at)
    SELECT
      json_extract(value, '$.id'), json_extract(value, '$.storyId'),
      json_extract(value, '$.title'), json_extract(value, '$.slug'),
      json_extract(value, '$.mediaIds'), json_extract(value, '$.publishedAt'),
      json_extract(value, '$.updatedAt')
    FROM json_each(?)
  `).bind(body);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM public_article_summaries"),
    env.DB.prepare("DELETE FROM public_article_versions"),
    insert,
    env.DB.prepare("INSERT INTO public_article_versions (id, updated_at, deleted) SELECT id, updated_at, 0 FROM public_article_summaries"),
  ]);
  return json(200, { count: value.length });
}

/** Summaries visible at `at`, newest publication first, as the sitemap and discovery read them. */
export async function readSummaries(env: Env, at: number, limit?: number): Promise<PublicArticleSummary[]> {
  const statement = limit === undefined
    ? env.DB.prepare("SELECT id, story_id, title, slug, media_ids, published_at, updated_at FROM public_article_summaries WHERE published_at <= ? ORDER BY published_at DESC, id COLLATE BINARY DESC").bind(at)
    : env.DB.prepare("SELECT id, story_id, title, slug, media_ids, published_at, updated_at FROM public_article_summaries WHERE published_at <= ? ORDER BY published_at DESC, id COLLATE BINARY DESC LIMIT ?").bind(at, limit);
  const result = await statement.all<{
    id: string; story_id: string; title: string; slug: string; media_ids: string; published_at: number; updated_at: number;
  }>();
  return result.results.map(row => ({
    id: row.id, storyId: row.story_id, title: row.title, slug: row.slug,
    mediaIds: JSON.parse(row.media_ids), publishedAt: row.published_at, updatedAt: row.updated_at,
  } satisfies PublicArticleSummary));
}

async function listSummaries(request: Request, env: Env) {
  const url = new URL(request.url);
  const at = Number(url.searchParams.get("at"));
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (!url.searchParams.has("at") || !Number.isSafeInteger(at) || (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0))) {
    return json(400, { error: "invalid_query" });
  }
  return json(200, await readSummaries(env, at, limit));
}

/** The version upsert and the summary write it gates, in batch order. */
function articleStatements(env: Env, id: string, value: PublicArticleSummary | { updatedAt: number }, deleted: boolean) {
  const { updatedAt } = value;
  // A tombstone retains the version so delayed publishes cannot resurrect an off-air Article.
  const version = env.DB.prepare(`INSERT INTO public_article_versions (id, updated_at, deleted) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted
    WHERE public_article_versions.updated_at < excluded.updated_at
      OR (public_article_versions.updated_at = excluded.updated_at AND public_article_versions.deleted <= excluded.deleted)`)
    .bind(id, updatedAt, deleted ? 1 : 0);
  if (deleted) {
    return [version, env.DB.prepare(`DELETE FROM public_article_summaries WHERE id = ? AND EXISTS
        (SELECT 1 FROM public_article_versions WHERE id = ? AND updated_at = ? AND deleted = 1)`).bind(id, id, updatedAt)];
  }
  const summary = value as PublicArticleSummary;
  return [version, env.DB.prepare(`INSERT INTO public_article_summaries (id, story_id, title, slug, media_ids, published_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
          (SELECT 1 FROM public_article_versions WHERE id = ? AND updated_at = ? AND deleted = 0)
        ON CONFLICT(id) DO UPDATE SET story_id = excluded.story_id, title = excluded.title, slug = excluded.slug,
          media_ids = excluded.media_ids, published_at = excluded.published_at, updated_at = excluded.updated_at`)
    .bind(id, summary.storyId, summary.title, summary.slug, JSON.stringify(summary.mediaIds),
      summary.publishedAt, updatedAt, id, updatedAt)];
}

export type ArticleChangeResult = "confirmed" | "stale" | "invalid";

/** Applies a summary or tombstone and reports whether this version is the one the index now holds. */
export async function applyArticleChange(env: Env, id: string, value: unknown, deleted: boolean): Promise<ArticleChangeResult> {
  const valid = isArticleId(id) && (deleted ? isTombstone(value) : isSummary(value) && value.id === id);
  if (!valid) return "invalid";
  const change = value as PublicArticleSummary | { updatedAt: number };
  await env.DB.batch(articleStatements(env, id, change, deleted));
  const current = await env.DB.prepare("SELECT updated_at, deleted FROM public_article_versions WHERE id = ?").bind(id).first<{ updated_at: number; deleted: number }>();
  return current?.updated_at === change.updatedAt && current.deleted === (deleted ? 1 : 0) ? "confirmed" : "stale";
}

async function applyArticle(request: Request, env: Env, id: string) {
  if (!isArticleId(id)) return json(400, { error: "invalid_article" });
  const parsed = await readJsonBody(request, { invalid: "invalid_article", tooLarge: "article_too_large" });
  if (parsed instanceof Response) return parsed;
  const result = await applyArticleChange(env, id, parsed.value, request.method === "DELETE");
  if (result === "invalid") return json(400, { error: "invalid_article" });
  if (result === "stale") return json(409, { error: "stale_article" });
  return json(200, { status: "confirmed" });
}

function logWorkerFailure(request: Request, env: Env, status: number, failure: "authorization" | "storage", authenticated: boolean) {
  const pathname = new URL(request.url).pathname;
  const route = pathname === "/snapshot" || pathname === "/summaries" ? pathname : pathname.startsWith("/articles/") ? "/articles/:id" : "unknown";
  const correlationId = authenticated ? request.headers.get("x-request-id") : null;
  console.error(JSON.stringify({ event: "public_article_index_worker", service: "cloudflare-worker", environment: "production",
    release: env.WORKER_VERSION?.id ?? "unknown", outcome: "failure", route, statusClass: `${Math.floor(status / 100)}xx`, failure,
    ...(correlationId && /^[a-zA-Z0-9_-]{1,128}$/.test(correlationId) ? { correlationId } : {}) }));
}

function articleIdFrom(pathname: string) {
  try {
    return decodeURIComponent(pathname.slice("/articles/".length));
  }
  catch { return undefined; }
}

async function routeRequest(request: Request, env: Env) {
  const pathname = new URL(request.url).pathname;
  if (request.method === "POST" && pathname === "/snapshot") return replaceSnapshot(request, env);
  if (request.method === "GET" && pathname === "/summaries") return listSummaries(request, env);
  if ((request.method === "PUT" || request.method === "DELETE") && pathname.startsWith("/articles/")) {
    const id = articleIdFrom(pathname);
    if (id === undefined) return json(400, { error: "invalid_article" });
    return applyArticle(request, env, id);
  }
  return json(404, { error: "not_found" });
}

export function createPublicArticleIndexWorker(dependencies: { keys?: JWTVerifyGetKey } = {}) {
  let lastAuthorizationSignalAt = -Infinity;
  // Unauthenticated traffic cannot create unbounded per-request diagnostic logs.
  function signalUnauthorized(request: Request, env: Env) {
    const now = Date.now();
    if (now - lastAuthorizationSignalAt < 60_000) return;
    lastAuthorizationSignalAt = now;
    logWorkerFailure(request, env, 401, "authorization", false);
  }
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (!await hasValidIdentity(request, env, dependencies.keys ?? googleKeys)) {
        signalUnauthorized(request, env);
        return json(401, { error: "unauthorized" });
      }
      try {
        return await routeRequest(request, env);
      }
      catch {
        logWorkerFailure(request, env, 503, "storage", true);
        return json(503, { error: "index_unavailable" });
      }
    },
  };
}

const worker = createPublicArticleIndexWorker();
export default { fetch: worker.fetch } satisfies ExportedHandler<Env>;
