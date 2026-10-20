import { createArticleSitemap } from "./articleSitemap";
import { createProductionPublicArticleIndexClient, logPublicArticleIndexFailure } from "./articleDistributionProduction";

export async function listSitemapArticles() {
  const correlationId = randomUUID();
  return createArticleSitemap({
    listProjection: () => createProductionPublicArticleIndexClient().list(Date.now(), correlationId),
    failed: error => logPublicArticleIndexFailure("projection", correlationId, error),
  }).list();
}
import { randomUUID } from "node:crypto";
