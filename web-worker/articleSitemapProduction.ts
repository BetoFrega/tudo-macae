import { randomUUID } from "node:crypto";
import { env } from "cloudflare:workers";
import { createArticleSitemap, type ArticleSitemapItem } from "@/packages/editorial/articleSitemap";
import { logPublicArticleIndexFailure } from "@/packages/editorial/articleDistributionProduction";
import { PublicArticleIndexFailure } from "@/packages/editorial/publicArticleIndexFailure";

interface ArticleIndexReader {
  summaries(at: number, correlationId?: string): Promise<ArticleSitemapItem[]>;
}

// Replaces `@/packages/editorial/articleSitemapProduction` in the Worker build: the
// web Worker reads the index through its `ARTICLE_INDEX` service binding, which
// needs no Google runtime identity. `wrangler.web.jsonc` declares the binding.
export async function listSitemapArticles() {
  const correlationId = randomUUID();
  const index = env.ARTICLE_INDEX as ArticleIndexReader | undefined;
  return createArticleSitemap({
    async listProjection() {
      if (!index) throw new PublicArticleIndexFailure("configuration");
      try {
        return await index.summaries(Date.now(), correlationId);
      }
      catch { throw new PublicArticleIndexFailure("request"); }
    },
    failed: error => logPublicArticleIndexFailure("projection", correlationId, error),
  }).list();
}
