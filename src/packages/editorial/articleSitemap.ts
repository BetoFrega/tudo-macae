export interface ArticleSitemapItem { id: string; slug: string }
export interface ArticleSitemapDependencies {
  listProjection(): Promise<ArticleSitemapItem[]>;
  failed?(error: unknown): void;
}

export function createArticleSitemap(dependencies: ArticleSitemapDependencies) {
  return {
    async list(): Promise<ArticleSitemapItem[]> {
      try {
        return await dependencies.listProjection();
      }
      catch (error) {
        dependencies.failed?.(error);
        throw error;
      }
    },
  };
}
