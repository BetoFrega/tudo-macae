import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { createPublicArticleIndex, type PublicArticleSummary } from "@tudomacae/editorial-blog/publicArticleIndex";
import { createPublicArticleIndexReconciliation } from "@tudomacae/editorial-blog/publicArticleIndexReconciliation";
import { articleIndexCandidate } from "./db/editorialBlog";
import { readPages } from "./db/editorialMedia";
import type { ArticleIndexWriter } from "./editorialBlogSynchronization";
import type { WorkerDependencies } from "./workerDependencies";

/** The `ArticleIndexWriter` entrypoint with the read a reconciliation needs. */
export interface ArticleIndexReconciler extends ArticleIndexWriter {
  summaries(correlationId?: string): Promise<PublicArticleSummary[]>;
}

const summaryFields = ["storyId", "title", "slug", "mediaIds", "publishedAt", "updatedAt"] as const;
const sameSummary = (left: PublicArticleSummary | undefined, right: PublicArticleSummary) =>
  !!left && summaryFields.every(field => JSON.stringify(left[field]) === JSON.stringify(right[field]));
// Logged differences stay bounded however far the index drifted.
const loggedDifferences = 50;

// Scheduled Articles are indexed too, so reaching their publication time needs no later write.
const everyPublication = Number.MAX_SAFE_INTEGER;

function reconciliationEvent(env: Env) {
  return { event: "public_article_index_reconciliation", service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown", release: env.CF_VERSION_METADATA?.id ?? "unknown" };
}

/** An article's current D1 state: its public summary while visible, and its version when D1 holds it. */
type CurrentArticle = { summary?: PublicArticleSummary; updatedAt?: number };

/** Brings an indexed row to the article's current state when its version moved on. */
async function apply(index: ArticleIndexReconciler, row: PublicArticleSummary, article: CurrentArticle, correlationId: string) {
  if (article.updatedAt === row.updatedAt) return;
  if (article.summary) await index.publish(article.summary, correlationId);
  else await index.retire(row.id, Math.max(row.updatedAt, article.updatedAt ?? 0), correlationId);
}

/**
 * Makes the index hold exactly the visible D1 articles. Each change goes through the index's version rules, so a save
 * that commits meanwhile is never undone: its newer version wins and the next run sees no difference.
 */
function repair(index: ArticleIndexReconciler, current: (id: string) => Promise<CurrentArticle>, correlationId: string) {
  return async (rows: PublicArticleSummary[]) => {
    const projected = new Map((await index.summaries(correlationId)).map(row => [row.id, row]));
    for (const row of rows) {
      const indexed = sameSummary(projected.get(row.id), row);
      projected.delete(row.id);
      if (indexed) continue;
      // Changed after the canonical scan: publishing the scanned version could resurrect a withdrawal whose own
      // synchronization failed. The next run compares the newer state.
      const article = await current(row.id);
      if (!article.summary || article.updatedAt !== row.updatedAt) continue;
      await index.publish(row, correlationId);
      // A save committed while publishing outranks it only through its own synchronization; if that failed, its newer
      // version replaces the scanned one here. A save after this read reaches the index through its own synchronization.
      await apply(index, row, await current(row.id), correlationId);
    }
    for (const row of projected.values()) await retireHidden(index, row, current, correlationId);
  };
}

/** Retires an indexed article D1 no longer shows, without outranking a publication that commits meanwhile. */
async function retireHidden(index: ArticleIndexReconciler, row: PublicArticleSummary, current: (id: string) => Promise<CurrentArticle>, correlationId: string) {
  // Published after the canonical scan: a tombstone at its own version would outrank that publication.
  const article = await current(row.id);
  if (article.summary) return;
  // A hidden or deleted article retires at its own version, or at the indexed one when D1 no longer holds it.
  await index.retire(row.id, Math.max(row.updatedAt, article.updatedAt ?? 0), correlationId);
  // A republication committed while retiring advances the version, so its summary outranks the tombstone.
  const retired = await current(row.id);
  if (retired.summary) await index.publish(retired.summary, correlationId);
}

/** Compares the index with the visible D1 articles and, when they differ, repairs it and compares again. */
export async function reconcileArticleIndex(persistence: Pick<EditorialPersistence, "page" | "read">, index: ArticleIndexReconciler, correlationId: string) {
  const canonical = createPublicArticleIndex({
    listCandidates: async () => (await readPages(persistence, { kind: "article", status: "published" })).map(articleIndexCandidate),
  });
  const reconciliation = createPublicArticleIndexReconciliation({
    listCanonical: () => canonical.list(everyPublication),
    listProjection: () => index.summaries(correlationId),
    replace: repair(index, async (id) => {
      const record = await persistence.read("article", id);
      const updatedAt = record?.body.updatedAt;
      // Unpublished records may lack the public fields, so only published ones are parsed as index candidates.
      const [summary] = record?.body.status === "published"
        ? await createPublicArticleIndex({ listCandidates: async () => [articleIndexCandidate(record)] }).list(everyPublication)
        : [];
      return { ...(summary ? { summary } : {}), ...(typeof updatedAt === "number" && Number.isSafeInteger(updatedAt) ? { updatedAt } : {}) };
    }, correlationId),
  });
  const found = await reconciliation.run(false);
  return { found, remaining: found.length ? await reconciliation.run(true) : [] };
}

class ArticleIndexUnbound extends Error {
  override name = "ArticleIndexUnbound";
  constructor() {
    super("ARTICLE_INDEX is not bound under the worker authority");
  }
}

/** Converges the public index on the editorial D1 hourly, only once the editorial authority belongs to the Worker. */
export async function runBlogIndexReconciliation(dependencies: WorkerDependencies, env: Env) {
  const service = dependencies.editorialMedia?.(env);
  if (!service) return;
  // Deployments without PUBLIC_ARTICLE_INDEX_SERVICE drop the binding, so the declared type overstates its presence.
  const index = env.ARTICLE_INDEX as unknown as ArticleIndexReconciler | undefined;
  // Joins this run's event with the index Worker's failure events for the writes it makes.
  const correlationId = crypto.randomUUID();
  const base = { ...reconciliationEvent(env), correlationId };
  try {
    if (await service.authority() !== "worker") return;
    // Under `worker` this run is the only automatic repair, so an unbound index must not pass silently.
    if (!index) throw new ArticleIndexUnbound();
    const { found, remaining } = await reconcileArticleIndex(service.persistence, index, correlationId);
    if (!found.length) return;
    // Differences name article IDs and fields only, never editorial content.
    const event = JSON.stringify({ ...base, outcome: remaining.length ? "partial" : "repaired", found: found.length,
      differences: found.slice(0, loggedDifferences), remaining: remaining.slice(0, loggedDifferences) });
    if (remaining.length) console.error(event);
    else console.info(event);
  }
  catch (error) {
    console.error(JSON.stringify({ ...base, outcome: "failed", errorName: error instanceof Error ? error.name : "unknown" }));
    throw error;
  }
}
