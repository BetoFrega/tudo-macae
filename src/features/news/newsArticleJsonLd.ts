import { articleLeadMediaIds } from "./articleLeadMedia";

export interface NewsArticleJsonLd {
  "@context": "https://schema.org";
  "@type": "NewsArticle";
  "headline": string;
  "description": string;
  "datePublished": string;
  "image"?: string[];
}

/**
 * Fields come from what the article already has. An article without media
 * omits `image` rather than pointing at a file that does not exist — the
 * same rule the share metadata follows.
 */
export function buildNewsArticleJsonLd(params: {
  article: { title: string; body: string; publishedAt: number };
  imageUrls: string[];
}): NewsArticleJsonLd {
  const { article, imageUrls } = params;

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": article.body.substring(0, 160),
    "datePublished": new Date(article.publishedAt).toISOString(),
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
  };
}

export function articleJsonLdImageUrls(params: {
  article: {
    media: Array<{ id: string }>;
    leadMediaId?: string | null;
    legacyHeaderMediaIds?: string[];
  };
  mediaUrls: Record<string, string>;
  origin: string;
}): string[] {
  const mediaIds = articleLeadMediaIds({
    mediaIds: params.article.media.map(item => item.id),
    ...(params.article.leadMediaId !== undefined ? { leadMediaId: params.article.leadMediaId } : {}),
    ...(params.article.legacyHeaderMediaIds !== undefined
      ? { legacyHeaderMediaIds: params.article.legacyHeaderMediaIds }
      : {}),
  });
  return mediaIds.flatMap((mediaId) => {
    const path = params.mediaUrls[mediaId];
    return path ? [new URL(path, params.origin).href] : [];
  });
}
