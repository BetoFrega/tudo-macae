import { z } from "zod";

/** Public Blog reads: no session, open only while the Worker owns editorial writes. */
export const blogPublicReadOperations = ["article", "page"] as const;
export type BlogPublicReadOperation = typeof blogPublicReadOperations[number];
/** The shape of a public article ID; anything else names no public article and reaches no Worker. */
export const publicArticleIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const articleId = z.string().min(1).max(128);
export const blogPublicReadInput = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("article"), input: z.strictObject({ id: articleId }) }),
  z.strictObject({ operation: z.literal("page"), input: z.strictObject({ cursor: articleId.optional() }) }),
]);
export type BlogPublicReadInput = z.infer<typeof blogPublicReadInput>;
/** Set on a public Blog 5xx the Worker already logged, so the app does not log the same failure again. */
export const blogPublicErrorReportedHeader = "x-blog-public-error-reported";
/** The procedure path; failures on it are the Blog's own signal, never account access. */
export const blogPublicReadPath = "/api/trpc/blogPublicRead";

const readerMedia = z.looseObject({ id: z.string(), digest: z.string().optional(), alt: z.string(), caption: z.string(), credit: z.string(), generated: z.boolean().optional() });
/** The reader content a publication receipt stores; persisted receipts and Worker answers both must match it. */
export const articleReaderContentSchema = z.looseObject({
  corrections: z.array(z.looseObject({ summary: z.string(), createdAt: z.number() })).optional(),
  title: z.string(), body: z.string(), path: z.string(), editorName: z.string().optional(), assisted: z.boolean().optional(),
  sources: z.array(z.looseObject({ name: z.string(), url: z.string().optional(), reportedAt: z.number().nullable().optional(), accessedAt: z.number().optional() })),
  media: z.array(readerMedia), leadMediaId: z.string().nullable().optional(), legacyHeaderMediaIds: z.array(z.string()).optional(),
});
const publicArticle = z.looseObject({
  id: z.string(), storyId: z.string(), title: z.string(), slug: z.string(), body: z.string(), mediaIds: z.array(z.string()),
  leadMediaId: z.string().nullable().optional(), legacyHeaderMediaIds: z.array(z.string()).optional(), status: z.string(),
  publishedAt: z.number().optional(), publicationReceiptId: z.string().optional(),
  corrections: z.array(z.looseObject({ correctedAt: z.number(), summary: z.string() })), createdAt: z.number(), updatedAt: z.number(),
});
/** A Worker answer to `article`, checked whole so a skewed or corrupt answer is incompatible rather than rendered. */
export const publicBlogArticleSchema = z.discriminatedUnion("kind", [
  z.looseObject({ kind: z.literal("published"), content: articleReaderContentSchema, publishedAt: z.number(), updatedAt: z.number().optional() }),
  z.looseObject({ kind: z.literal("legacy"), article: publicArticle, media: z.array(readerMedia),
    story: z.looseObject({ occurredAt: z.number() }).nullable(),
    sources: z.array(z.looseObject({ id: z.string(), name: z.string(), url: z.string().optional(), canonicalUrl: z.string().optional() })),
    editorName: z.string().nullable() }),
  z.looseObject({ kind: z.literal("unavailable") }),
]);
/** A Worker answer to `page`. */
export const publicBlogPageSchema = z.looseObject({
  items: z.array(z.looseObject({ id: z.string(), title: z.string(), slug: z.string(), publishedAt: z.number().optional(), publicationReceiptId: z.string().optional(), lead: readerMedia.optional() })),
  nextCursor: z.string().optional(),
});
/**
 * Public editorial image bytes. The origin path matches `editorialImageSourceUrl`, so the images Worker and the
 * verified purge reach the same address on either host; the article path serves the Media a receipt granted.
 */
export const editorialImageOriginRoute = /^\/api\/imagens\/editorial\/([A-Za-z0-9_-]{1,128})\/([a-f0-9]{64})$/;
export const articleMediaRoute = /^\/api\/noticia\/([A-Za-z0-9_-]{1,128})\/midias\/([^/]{1,2400})$/;
/** The Media identifier contract: trimmed, 1 to 200 characters, no `/`; encoded, a character takes up to 12 (four `%XX` bytes). */
const isMediaId = (value: string) => value.length >= 1 && value.length <= 200 && value.trim() === value && !value.includes("/");
/** The Media ID an article image path carries, percent-decoded; null outside the Media identifier contract. */
export function articleMediaId(segment: string) {
  try {
    const value = decodeURIComponent(segment);
    return isMediaId(value) ? value : null;
  }
  catch {
    return null;
  }
}
export const editorialImageOriginPath = (mediaId: string, digest: string) => `/api/imagens/editorial/${mediaId}/${digest}`;
export const articleMediaPath = (articleId: string, mediaId: string) => `/api/noticia/${articleId}/midias/${encodeURIComponent(mediaId)}`;
