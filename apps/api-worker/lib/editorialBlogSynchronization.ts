import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { createArticleDistribution, type PublicArticleIndexCandidate } from "@tudomacae/editorial-blog/articleDistribution";
import type { BlogDependencies } from "@tudomacae/editorial-blog/blog";
import { readArticleIndexCandidate } from "./db/editorialBlog";

type ArticleChangeResult = "confirmed" | "stale" | "invalid";

/** The `ArticleIndexWriter` entrypoint of `apps/public-article-index`, reached through a service binding. */
export interface ArticleIndexWriter {
  publish(summary: Omit<PublicArticleIndexCandidate, "status"> & { publishedAt: number }, correlationId?: string): Promise<ArticleChangeResult>;
  retire(id: string, updatedAt: number, correlationId?: string): Promise<ArticleChangeResult>;
}

class ArticleIndexUnavailable extends Error {
  constructor(readonly failure: "configuration" | "response" | "request", readonly result?: ArticleChangeResult) {
    super(failure);
  }
}

async function applyCandidate(index: ArticleIndexWriter | undefined, candidate: PublicArticleIndexCandidate, correlationId?: string) {
  if (!index) throw new ArticleIndexUnavailable("configuration");
  let result: ArticleChangeResult;
  try {
    const { id, storyId, title, slug, mediaIds, status, publishedAt, updatedAt } = candidate;
    result = status === "published" && publishedAt !== undefined
      ? await index.publish({ id, storyId, title, slug, mediaIds, publishedAt, updatedAt }, correlationId)
      : await index.retire(id, updatedAt, correlationId);
  }
  catch { throw new ArticleIndexUnavailable("request"); }
  // A stale answer means a newer version already reached the index, which this save cannot confirm.
  if (result !== "confirmed") throw new ArticleIndexUnavailable("response", result);
}

/**
 * Converges the public index and the retired Media of one Article after its save commits.
 * The article record is the durable intent: a later save or reconciliation repeats this safely.
 */
export function createBlogSynchronization(dependencies: {
  persistence: Pick<EditorialPersistence, "read">;
  /** Absent when the deployment binds no index; distribution then stays unconfirmed. */
  index?: ArticleIndexWriter;
  cleanup(articleId: string, correlationId?: string): Promise<"confirmed" | "unconfirmed">;
  context: { environment: string; release: string };
}): BlogDependencies["synchronize"] {
  const distribution = createArticleDistribution({
    readCandidate: id => readArticleIndexCandidate(dependencies.persistence, id),
    apply: (candidate, correlationId) => applyCandidate(dependencies.index, candidate, correlationId),
    failed(error, correlationId, stage) {
      const failure = error instanceof ArticleIndexUnavailable ? error.failure : stage === "canonical-read" ? "canonical-read" : "unknown";
      console.error(JSON.stringify({ event: "public_article_index_failure", service: "api-worker", ...dependencies.context,
        outcome: "failure", operation: "distribution", failure,
        ...(error instanceof ArticleIndexUnavailable && error.result ? { result: error.result } : {}),
        ...(correlationId && /^[a-zA-Z0-9_-]{1,128}$/.test(correlationId) ? { correlationId } : {}) }));
    },
  });
  return async (id, correlationId = crypto.randomUUID()) => {
    const [distributed, cleaned] = await Promise.all([distribution.synchronize(id, correlationId), dependencies.cleanup(id, correlationId)]);
    return distributed.status === "confirmed" && cleaned === "confirmed" ? "confirmed" : "unconfirmed";
  };
}
