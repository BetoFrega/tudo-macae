import { articleIsVisible } from "@tudomacae/editorial-planning/eligibility";
import type { Media } from "@tudomacae/media/model";
import type { ArticleReaderContent } from "./articleReader";
import { articleHeaderMediaIds } from "./articleMediaRoles";
import { createPublishedSubmissionReader, type PublicationReadState } from "./publishedArticle";
import { publicArticleIdPattern } from "./publicProtocol";

export type ArticleReaderMedia = ArticleReaderContent["media"][number];

/** An article as stored before the Blog kept its own reader content; the public page renders these fields. */
export interface PublicArticle {
  id: string;
  storyId: string;
  title: string;
  slug: string;
  body: string;
  mediaIds: string[];
  leadMediaId?: string | null;
  legacyHeaderMediaIds?: string[];
  status: string;
  publishedAt?: number;
  publishedBy?: string;
  publicationReceiptId?: string;
  corrections: Array<{ correctedAt: number; summary: string }>;
  createdAt: number;
  updatedAt: number;
}
export interface PublicArticleSource { id: string; name: string; url?: string; canonicalUrl?: string }

/** One reader page: the published edition of a receipt, an article without one, or nothing public. */
export type PublicBlogArticle
  = | Extract<Awaited<ReturnType<ReturnType<typeof createPublishedSubmissionReader>["read"]>>, { kind: "published" }>
    | { kind: "legacy"; article: Omit<PublicArticle, "publishedBy">; media: ArticleReaderMedia[]; story: { occurredAt: number } | null; sources: PublicArticleSource[]; editorName: string | null }
    | { kind: "unavailable" };
export interface PublicBlogPageItem {
  id: string;
  title: string;
  slug: string;
  publishedAt?: number;
  publicationReceiptId?: string;
  lead?: ArticleReaderMedia;
}
export interface PublicBlogPage { items: PublicBlogPageItem[]; nextCursor?: string }

export interface PublicBlogDependencies {
  now(): number;
  readPublication(articleId: string): Promise<PublicationReadState>;
  readArticle(id: string): Promise<PublicArticle | null>;
  /** Existing Media in the order of `ids`. */
  readMedia(ids: string[]): Promise<Media[]>;
  readStory(storyId: string): Promise<{ occurredAt: number } | null>;
  readSources(storyId: string): Promise<PublicArticleSource[]>;
  /** The public name of an editor, or `null` when it cannot be shown. */
  readEditorName(uid: string): Promise<string | null>;
  /** Visible articles at `at`, newest publication first, 20 per page after the article `cursor` names. */
  listPublished(at: number, cursor?: string): Promise<{ items: PublicArticle[]; nextCursor?: string }>;
}

const readerMedia = (item: Media): ArticleReaderMedia => ({
  id: item.id, ...(item.digest ? { digest: item.digest } : {}), alt: item.alt, caption: item.caption,
  credit: item.provenance.credit, generated: item.provenance.origin === "generated",
});

/**
 * Public Blog reads: a receipt decides a managed article, and an article without one shows its active, referenced
 * Media read fresh, so a metadata correction reaches every page that shows it.
 */
export function createPublicBlog(dependencies: PublicBlogDependencies) {
  const receipts = createPublishedSubmissionReader(dependencies);
  async function referencedMedia(article: PublicArticle, ids: string[]) {
    if (ids.length === 0) return [];
    const referenced = new Set(article.mediaIds);
    return (await dependencies.readMedia(ids)).filter(item => item.status === "active" && referenced.has(item.id)).map(readerMedia);
  }
  return {
    async article(id: string): Promise<PublicBlogArticle> {
      if (!publicArticleIdPattern.test(id)) return { kind: "unavailable" };
      const exact = await receipts.read(id);
      // Corrections keep what readers see; the editor's account ID stays inside the receipt.
      if (exact.kind === "published") return { ...exact, content: { ...exact.content, ...(exact.content.corrections ? { corrections: exact.content.corrections.map(({ summary, createdAt }) => ({ summary, createdAt })) } : {}) } };
      if (exact.kind === "unavailable") return { kind: "unavailable" };
      const article = await dependencies.readArticle(id);
      if (!article || !articleIsVisible(article, dependencies.now())) return { kind: "unavailable" };
      const [media, sources, story, editorName] = await Promise.all([
        referencedMedia(article, article.mediaIds),
        dependencies.readSources(article.storyId),
        dependencies.readStory(article.storyId),
        article.publishedBy ? dependencies.readEditorName(article.publishedBy) : null,
      ]);
      // The editor's account ID only resolves `editorName`; readers never receive it.
      const { publishedBy: _publishedBy, ...publicFields } = article;
      return { kind: "legacy", article: publicFields, media, story, sources, editorName };
    },
    async page(cursor?: string): Promise<PublicBlogPage> {
      const page = await dependencies.listPublished(dependencies.now(), cursor && publicArticleIdPattern.test(cursor) ? cursor : undefined);
      const items = await Promise.all(page.items.map(async (article): Promise<PublicBlogPageItem> => {
        const [lead] = await referencedMedia(article, articleHeaderMediaIds(article).slice(0, 1));
        return { id: article.id, title: article.title, slug: article.slug,
          ...(article.publishedAt !== undefined ? { publishedAt: article.publishedAt } : {}),
          ...(article.publicationReceiptId ? { publicationReceiptId: article.publicationReceiptId } : {}),
          ...(lead ? { lead } : {}) };
      }));
      return { items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
    },
  };
}
