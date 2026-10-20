/** One published Article in the public discovery index. */
export interface PublicArticleSummary {
  id: string;
  storyId: string;
  title: string;
  slug: string;
  mediaIds: string[];
  publishedAt: number;
  updatedAt: number;
}

/** The canonical Article state the index converges to: a summary when visible, a tombstone otherwise. */
export interface PublicArticleIndexCandidate extends Omit<PublicArticleSummary, "publishedAt"> {
  status: string;
  publishedAt?: number;
}

export type ArticleDistributionResult = { status: "confirmed" | "unconfirmed" };

export interface ArticleDistributionDependencies {
  readCandidate(id: string): Promise<PublicArticleIndexCandidate | null>;
  apply(candidate: PublicArticleIndexCandidate, correlationId?: string): Promise<void>;
  failed?(error: unknown, correlationId?: string, stage?: "canonical-read" | "projection"): void;
}

export function createArticleDistribution(dependencies: ArticleDistributionDependencies) {
  return {
    async synchronize(id: string, correlationId?: string): Promise<ArticleDistributionResult> {
      let stage: "canonical-read" | "projection" = "canonical-read";
      try {
        const candidate = await dependencies.readCandidate(id);
        if (!candidate) throw new Error("Article unavailable");
        stage = "projection";
        await dependencies.apply(candidate, correlationId);
        return { status: "confirmed" };
      }
      catch (error) {
        dependencies.failed?.(error, correlationId, stage);
        return { status: "unconfirmed" };
      }
    },
  };
}
