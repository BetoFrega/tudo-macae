import { z } from "zod";
import type { EditorialPersistence, StoredRecord, Transaction } from "@tudomacae/editorial-persistence";
import { publicEditorName } from "@tudomacae/editorial-blog/editorName";
import type { PublicArticle, PublicArticleSource, PublicBlogDependencies } from "@tudomacae/editorial-blog/publicBlog";
import type { ArticleEditionReceipt } from "@tudomacae/editorial-blog/publishedArticle";
import { articleReaderContentSchema } from "@tudomacae/editorial-blog/publicProtocol";
import { parseStoredMedia, readPages, toMedia } from "./editorialMedia";

type Reader = Pick<Transaction, "read">;
const pageSize = 20;
export const grantSchema = z.object({ operationId: z.string(), submissionId: z.string().optional(), articleId: z.string(), mediaId: z.string(), revision: z.number().int().nonnegative(), digest: z.string() });
const receiptSchema = z.looseObject({
  operationId: z.string(), articleId: z.string(), status: z.string(),
  content: articleReaderContentSchema,
  grants: z.array(grantSchema),
  corrections: z.array(z.object({ summary: z.string(), createdAt: z.number(), editorId: z.string().optional() })).optional(),
  publicUpdatedAt: z.number().optional(),
});
// Redação articles keep fields the reader never shows; only those it renders are checked.
const articleSchema = z.looseObject({
  storyId: z.string().optional(), title: z.string(), slug: z.string(), body: z.string().optional(), blogContent: z.looseObject({ body: z.string() }).optional(), mediaIds: z.array(z.string()).optional(),
  leadMediaId: z.string().nullable().optional(), legacyHeaderMediaIds: z.array(z.unknown()).optional(),
  status: z.string(), publishedAt: z.number().optional(), publishedBy: z.string().optional(), publicationReceiptId: z.unknown().optional(),
  corrections: z.array(z.object({ correctedAt: z.number(), summary: z.string() })).optional(),
  createdAt: z.number(), updatedAt: z.number(),
}).refine(data => data.body !== undefined || data.blogContent !== undefined, "article without text");
const grantId = (grant: { operationId: string; mediaId: string }) => `${grant.operationId.length}-${grant.operationId}${grant.mediaId}`;

type ArticleData = z.infer<typeof articleSchema>;
/** The legacy header fallback of the Firestore catalog: without a lead, the stored gallery or every Media. */
function headerFields(data: ArticleData) {
  const legacyHeaderMediaIds = data.legacyHeaderMediaIds?.filter((id): id is string => typeof id === "string")
    ?? (data.leadMediaId === undefined ? data.mediaIds ?? [] : undefined);
  return { ...(data.leadMediaId !== undefined ? { leadMediaId: data.leadMediaId } : {}), ...(legacyHeaderMediaIds ? { legacyHeaderMediaIds } : {}) };
}
function publicationFields(data: ArticleData) {
  return { ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
    ...(data.publishedBy ? { publishedBy: data.publishedBy } : {}),
    ...(typeof data.publicationReceiptId === "string" ? { publicationReceiptId: data.publicationReceiptId } : {}) };
}

/** The same fields the Firestore catalog maps, so both sources render one page. */
function publicArticle(record: StoredRecord): PublicArticle {
  const data = parseStoredMedia(articleSchema, record.body);
  return { id: record.id, storyId: data.storyId ?? record.id, title: data.title, slug: data.slug, body: data.blogContent?.body ?? data.body!,
    mediaIds: data.mediaIds ?? [], status: data.status, ...headerFields(data),
    corrections: data.corrections ?? [], createdAt: data.createdAt, updatedAt: data.updatedAt, ...publicationFields(data) };
}

/** Story, capture and source records are retired Redação data imported as `legacy` under their collection name. */
function legacyReader(persistence: Pick<EditorialPersistence, "read">) {
  return async (collection: string, id: unknown) => (typeof id === "string" && id ? (await persistence.read("legacy", id, collection))?.body : undefined);
}

async function readPublication(reader: Reader, articleId: string) {
  const [article, claim] = await Promise.all([reader.read("article", articleId), reader.read("legacy", articleId, "news_publication_claims")]);
  const pointer = article?.body.publicationReceiptId;
  const receiptId = typeof pointer === "string" ? pointer : undefined;
  const stored = receiptId ? await reader.read("publicationReceipt", receiptId) : null;
  const receipt = stored ? parseStoredMedia(receiptSchema, stored.body) as ArticleEditionReceipt : null;
  const grants = receipt ? await Promise.all(receipt.grants.map(grant => reader.read("publicationGrant", grantId(grant)))) : [];
  return {
    // Any pointer but `null` marks the article managed; one that is no receipt ID then publishes nothing.
    managed: !!claim || (pointer !== undefined && pointer !== null),
    article: article ? { status: String(article.body.status), receiptId: receiptId ?? "", publishedAt: article.body.publishedAt as number } : null,
    receipt,
    grants: grants.flatMap(record => (record ? [parseStoredMedia(grantSchema, record.body)] : [])),
  };
}

/** The receipt state of one article, read in one snapshot so its grants match the receipt that names them. */
export const readPublicationState = (persistence: Pick<EditorialPersistence, "snapshot">, articleId: string) => persistence.snapshot(reader => readPublication(reader, articleId));

/** Public Blog reads over the editorial D1; display names stay with the identity owner. */
export function createPublicBlogStore(persistence: EditorialPersistence, displayName: (uid: string) => Promise<string | undefined>): Omit<PublicBlogDependencies, "now"> {
  const legacy = legacyReader(persistence);
  return {
    readPublication: articleId => readPublicationState(persistence, articleId),
    async readArticle(id) {
      const record = await persistence.read("article", id);
      return record ? publicArticle(record) : null;
    },
    async readMedia(ids) {
      const records = await Promise.all(ids.map(id => persistence.read("media", id)));
      return records.flatMap(record => (record ? [toMedia(record)] : []));
    },
    async readStory(storyId) {
      const story = await legacy("news_stories", storyId);
      return story ? { occurredAt: story.occurredAt as number } : null;
    },
    async readSources(storyId): Promise<PublicArticleSource[]> {
      const story = await legacy("news_stories", storyId);
      if (!story) return [];
      const captures = await Promise.all((Array.isArray(story.captureIds) ? story.captureIds : []).map(id => legacy("news_captures", id)));
      const sourceIds = [...new Set(captures.flatMap(capture => (typeof capture?.sourceId === "string" && capture.sourceId ? [capture.sourceId] : [])))];
      const sources = await Promise.all(sourceIds.map(async id => ({ id, body: await legacy("news_sources", id) })));
      return sources.flatMap(({ id, body }) => (body
        ? [{ id, name: body.name as string,
            ...(typeof body.url === "string" ? { url: body.url } : {}),
            ...(typeof body.canonicalUrl === "string" ? { canonicalUrl: body.canonicalUrl } : {}) }]
        : []));
    },
    async readEditorName(uid) {
      return publicEditorName(await displayName(uid).catch(() => undefined)) ?? null;
    },
    async listPublished(at, cursor) {
      const boundary = cursor ? await persistence.read("article", cursor) : null;
      const boundaryAt = boundary?.body.publishedAt;
      const after = typeof boundaryAt === "number" && Number.isFinite(boundaryAt) && boundaryAt <= at ? JSON.stringify([boundaryAt, "", boundary!.id]) : undefined;
      const records = await readPages(persistence, { kind: "article", status: "published", order: "publishedDesc", publishedAtOrBefore: at, ...(after ? { after } : {}) }, pageSize + 1);
      return { items: records.slice(0, pageSize).map(publicArticle), ...(records.length > pageSize ? { nextCursor: records[pageSize - 1]!.id } : {}) };
    },
  };
}
