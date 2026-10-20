import type { MediaPublicationGrant } from "@tudomacae/media/publicationGrants";
import { parseArticleBodyMediaReferences } from "./articleMediaBody";
import { resolveLegacyHeaderMediaIds } from "./articleMediaRoles";
import type { ArticleReaderContent } from "./articleReader";
import type { BlogPost } from "./blog";

/** Article fields every Blog store reads; the transfer copies them verbatim, so both stores must map them alike. */
export interface StoredBlogArticle {
  title: string;
  body: string;
  slug?: string;
  mediaIds?: string[];
  leadMediaId?: string | null;
  legacyHeaderMediaIds?: string[];
}

/** One receipt per post, replaced on every publication. */
export const blogOperationId = (articleId: string) => `blog-${articleId}`;

/** Reader content of an article published before the Blog stored its own. */
export function legacyBlogContent(id: string, data: StoredBlogArticle): ArticleReaderContent {
  return {
    title: data.title, body: data.body, path: `/noticia/${id}/${data.slug}`,
    media: [], sources: [],
    ...(data.leadMediaId !== undefined ? { leadMediaId: data.leadMediaId } : {}),
    legacyHeaderMediaIds: data.legacyHeaderMediaIds ?? (data.leadMediaId === undefined ? data.mediaIds ?? [] : []),
  };
}

export function blogHeaderMediaIds(content: ArticleReaderContent, data: Pick<StoredBlogArticle, "mediaIds">) {
  return resolveLegacyHeaderMediaIds({ ...content,
    mediaIds: content.media.length ? content.media.map(item => item.id) : data.mediaIds ?? [],
    bodyHasMedia: parseArticleBodyMediaReferences(content.body).length > 0 });
}

/** Sources cited by several captures appear once, in first-citation order. */
export function uniqueSources<T extends { name: string; url?: string }>(sources: T[]): T[] {
  return sources.filter((source, index) => sources.findIndex(item => item.name === source.name && item.url === source.url) === index);
}

export function blogPublicationReceipt(articleId: string, post: BlogPost, grants: MediaPublicationGrant[], previous: BlogPost | null) {
  return {
    operationId: blogOperationId(articleId), articleId, status: "completed", content: post.content, grants,
    createdAt: post.createdAt, updatedAt: post.updatedAt,
    ...(post.createdBy ? { createdBy: post.createdBy } : {}),
    ...(previous?.publishedAt !== undefined && previous.publishedAt <= post.updatedAt ? { publicUpdatedAt: post.updatedAt } : {}),
    publishedAt: post.publishedAt, fingerprint: "blog", corrections: post.content.corrections ?? [],
  };
}
