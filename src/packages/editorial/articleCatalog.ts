import { articleIsVisible } from "@tudomacae/editorial-planning/eligibility";
export interface Article {
  id: string;
  storyId: string;
  title: string;
  slug: string;
  body: string;
  mediaIds: string[];
  leadMediaId?: string | null;
  legacyHeaderMediaIds?: string[];
  status: "draft" | "awaitingPublication" | "published" | "offAir" | "rejected";
  publishedAt?: number;
  publishedBy?: string;
  publicationReceiptId?: string;
  corrections: Array<{ correctedAt: number; summary: string }>;
  createdAt: number;
  updatedAt: number;
}

export { articleIsVisible } from "@tudomacae/editorial-planning/eligibility";

export interface ArticleCatalogDependencies {
  now(): number;
  read(id: string): Promise<Article | null>;
  listVisible(at: number, limit?: number): Promise<Article[]>;
}

export function createArticleCatalog(dependencies: ArticleCatalogDependencies) {
  return {
    async read(id: string): Promise<Article | null> {
      const article = await dependencies.read(id);
      return article && articleIsVisible(article, dependencies.now()) ? article : null;
    },
    async list(limit?: number): Promise<Article[]> {
      return dependencies.listVisible(dependencies.now(), limit);
    },
  };
}
