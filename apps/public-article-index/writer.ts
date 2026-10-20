import { WorkerEntrypoint } from "cloudflare:workers";
import { applyArticleChange, readSummaries, type ArticleChangeResult } from "./index";

/**
 * Article changes from Workers bound to this entrypoint. A service binding is the
 * caller's identity, so it skips the Google OIDC check the HTTP routes require;
 * only Workers whose configuration names this entrypoint can reach it.
 */
export class ArticleIndexWriter extends WorkerEntrypoint<Env> {
  publish(summary: unknown, correlationId?: unknown): Promise<ArticleChangeResult> {
    const id = summary && typeof summary === "object" && "id" in summary && typeof summary.id === "string" ? summary.id : "";
    return this.apply("publish", id, summary, false, correlationId);
  }

  retire(id: unknown, updatedAt: unknown, correlationId?: unknown): Promise<ArticleChangeResult> {
    return this.apply("retire", typeof id === "string" ? id : "", { updatedAt }, true, correlationId);
  }

  /** Every summary the index holds, scheduled ones included, so a bound Worker can reconcile it against its source. */
  async summaries(correlationId?: unknown) {
    try {
      return await readSummaries(this.env, Number.MAX_SAFE_INTEGER);
    }
    catch (error) {
      this.storageFailure("summaries", correlationId);
      throw error;
    }
  }

  private async apply(operation: "publish" | "retire", id: string, value: unknown, deleted: boolean, correlationId: unknown) {
    try {
      return await applyArticleChange(this.env, id, value, deleted);
    }
    catch (error) {
      this.storageFailure(operation, correlationId);
      throw error;
    }
  }

  private storageFailure(operation: "publish" | "retire" | "summaries", correlationId: unknown) {
    console.error(JSON.stringify({ event: "public_article_index_worker", service: "cloudflare-worker", environment: "production",
      release: this.env.WORKER_VERSION?.id ?? "unknown", outcome: "failure", route: `ArticleIndexWriter.${operation}`, failure: "storage",
      ...(typeof correlationId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(correlationId) ? { correlationId } : {}) }));
  }
}
