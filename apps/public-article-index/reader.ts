import { WorkerEntrypoint } from "cloudflare:workers";
import { readSummaries } from "./index";

/**
 * Published summaries for Workers bound to this entrypoint, such as the web
 * Worker's sitemap. Like `ArticleIndexWriter`, the binding is the caller's
 * identity; this entrypoint only reads, so a reader binding cannot change the index.
 * The instant is capped at the producer's clock, so a caller cannot see scheduled Articles.
 */
export class ArticleIndexReader extends WorkerEntrypoint<Env> {
  async summaries(at: unknown, correlationId?: unknown) {
    try {
      if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) throw new TypeError("Invalid summary instant");
      return await readSummaries(this.env, Math.min(at, Date.now()));
    }
    catch (error) {
      console.error(JSON.stringify({ event: "public_article_index_worker", service: "cloudflare-worker", environment: "production",
        release: this.env.WORKER_VERSION?.id ?? "unknown", outcome: "failure", route: "ArticleIndexReader.summaries",
        failure: error instanceof TypeError ? "request" : "storage",
        ...(typeof correlationId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(correlationId) ? { correlationId } : {}) }));
      throw error;
    }
  }
}
