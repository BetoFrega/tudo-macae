import { z } from "zod";
import type { EditorialPersistence, RecordBody, StoredRecord, Transaction } from "@tudomacae/editorial-persistence";
import type { ArticleReaderContent } from "@tudomacae/editorial-blog/articleReader";
import type { PublicArticleIndexCandidate } from "@tudomacae/editorial-blog/articleDistribution";
import { blogHeaderMediaIds, blogOperationId, blogPublicationReceipt, legacyBlogContent, uniqueSources } from "@tudomacae/editorial-blog/blogRecords";
import type { BlogDependencies, BlogPost, BlogPostSummary } from "@tudomacae/editorial-blog/blog";
import { publicEditorName } from "@tudomacae/editorial-blog/editorName";
import { retirementKeys } from "@tudomacae/editorial-blog/mediaCleanup";
import type { Media } from "@tudomacae/media/model";
import type { MediaPublicationGrant } from "@tudomacae/media/publicationGrants";
import { createLegacySourcePermissions } from "./editorialSourcePermissions";
import { mediaRecord, parseStoredMedia, readPages, recordBody, toMedia, transactMedia } from "./editorialMedia";

type Reader = Pick<Transaction, "read">;
const content = z.custom<ArticleReaderContent>(value => typeof value === "object" && value !== null);
const corrections = z.array(z.object({ summary: z.string(), createdAt: z.number(), editorId: z.string().optional() }));
// Legacy Redação articles keep their own fields; only those the Blog reads are checked.
const articleSchema = z.looseObject({
  status: z.string(), createdAt: z.number(), updatedAt: z.number(), revision: z.number().int().nonnegative().optional(),
  blog: z.boolean().optional(), blogContent: content.optional(), title: z.string(), body: z.string().optional(), slug: z.string().optional(),
  publishedAt: z.number().optional(), publishedBy: z.string().optional(), createdBy: z.string().optional(), storyId: z.string().optional(),
  mediaIds: z.array(z.string()).optional(), leadMediaId: z.string().nullable().optional(), legacyHeaderMediaIds: z.array(z.string()).optional(),
  publicationReceiptId: z.string().optional(), pendingMediaPurges: z.array(z.string()).optional(),
  corrections: z.array(z.object({ summary: z.string(), correctedAt: z.number() })).optional(),
}).refine(data => data.body !== undefined || data.blogContent !== undefined, "article without text");
const receiptSchema = z.looseObject({ content: content.optional(), corrections: corrections.optional() });
const grantSchema = z.object({ operationId: z.string(), submissionId: z.string().optional(), articleId: z.string(), mediaId: z.string(), revision: z.number().int().nonnegative(), digest: z.string() });
type ArticleData = z.infer<typeof articleSchema>;

/** Live roles and public names stay with the identity owner; the store only asks. */
export interface BlogIdentity {
  isOperator(id: string): Promise<boolean>;
  displayName(id: string): Promise<string | undefined>;
}

const pageSize = 20;
/** Other Redação articles keep shapes the Blog never reads, so they are skipped before validation. */
const isBlogArticle = (record: StoredRecord) => Boolean(record.body.blog) || Number.isFinite(record.body.publishedAt);
const grantId = (grant: Pick<MediaPublicationGrant, "operationId" | "mediaId">) => `${grant.operationId.length}-${grant.operationId}${grant.mediaId}`;
const isScheduled = (data: ArticleData, now: number) => data.status === "published" && (data.publishedAt ?? 0) > now;
const articleData = (record: StoredRecord) => parseStoredMedia(articleSchema, record.body);

/** Story, capture and source records are retired Redação data imported as `legacy`, so they never change under a decision. */
function createLegacyAttribution(persistence: Pick<EditorialPersistence, "read">, identity: BlogIdentity) {
  const legacy = async (collection: string, id: unknown) => typeof id === "string" && id ? (await persistence.read("legacy", id, collection))?.body : undefined;
  async function captureSource(capture: RecordBody) {
    const source = await legacy("news_sources", capture.sourceId);
    const url = source?.canonicalUrl ?? source?.url ?? capture.sourceUrl;
    return { name: typeof source?.name === "string" ? source.name : "Referência", ...(typeof url === "string" && url ? { url } : {}) };
  }
  async function storySources(storyId: string) {
    const story = await legacy("news_stories", storyId);
    const captureIds = Array.isArray(story?.captureIds) ? story.captureIds : [];
    const captures = await Promise.all(captureIds.map(captureId => legacy("news_captures", captureId)));
    const sources = await Promise.all(captures.filter(item => item !== undefined).map(captureSource));
    return uniqueSources(sources);
  }
  return async function attribute(data: ArticleData, content: ArticleReaderContent) {
    let attributed = content;
    if (data.storyId) attributed = { ...attributed, sources: await storySources(data.storyId) };
    if (!data.publishedBy) return attributed;
    const editorName = publicEditorName(await identity.displayName(data.publishedBy).catch(() => undefined));
    return editorName ? { ...attributed, editorName } : attributed;
  };
}

function correctionsFor(data: ArticleData, receipt: z.infer<typeof receiptSchema> | null) {
  if (receipt?.corrections) return { corrections: receipt.corrections };
  if (receipt || !data.corrections?.length) return {};
  return { corrections: data.corrections.map(item => ({ summary: item.summary, createdAt: item.correctedAt })) };
}

function postFrom(id: string, data: ArticleData, content: ArticleReaderContent, now: number): BlogPost {
  return { id, status: data.status === "published" ? "published" : "draft",
    revision: data.revision ?? 0, content, mediaIds: data.mediaIds ?? [],
    createdAt: data.createdAt, updatedAt: data.updatedAt,
    ...(data.createdBy || data.publishedBy ? { createdBy: data.createdBy ?? data.publishedBy } : {}),
    ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
    ...(isScheduled(data, now) ? { scheduled: true } : {}) };
}

/** Keeps the fields the Blog does not own; an absent `publishedAt` is removed, and the text lives only in `blogContent`. */
function articleBody(previous: RecordBody | undefined, articleId: string, post: BlogPost, pendingMediaPurges: string[]) {
  const { publishedAt: _publishedAt, body: _body, ...kept } = previous ?? {};
  return recordBody({
    ...kept,
    blog: true, blogContent: post.content, id: articleId, storyId: typeof previous?.storyId === "string" ? previous.storyId : articleId,
    title: post.content.title, slug: post.content.path.split("/").at(-1),
    status: post.status, revision: post.revision, mediaIds: post.mediaIds,
    ...(post.content.leadMediaId !== undefined ? { leadMediaId: post.content.leadMediaId } : {}),
    ...(post.content.legacyHeaderMediaIds !== undefined ? { legacyHeaderMediaIds: post.content.legacyHeaderMediaIds } : {}),
    createdAt: post.createdAt, updatedAt: post.updatedAt,
    ...(post.createdBy ? { createdBy: post.createdBy } : {}),
    ...(post.publishedAt !== undefined ? { publishedAt: post.publishedAt } : {}),
    ...(post.status === "published" ? { publicationReceiptId: blogOperationId(articleId) } : {}),
    pendingMediaPurges,
  });
}

/** Blog records over the editorial D1: the article, its receipt, Media grants and staged activation commit together. */
export function createBlogStore(persistence: EditorialPersistence, identity: BlogIdentity, now: () => number): Omit<BlogDependencies, "now" | "newId" | "synchronize"> {
  const attribute = createLegacyAttribution(persistence, identity);
  const permissions = createLegacySourcePermissions(persistence);
  async function readPost(reader: Reader, article: StoredRecord | null): Promise<BlogPost | null> {
    if (!article) return null;
    if (!isBlogArticle(article)) return null;
    const data = articleData(article);
    const stored = data.publicationReceiptId ? await reader.read("publicationReceipt", data.publicationReceiptId) : null;
    const receipt = stored ? parseStoredMedia(receiptSchema, stored.body) : null;
    let content: ArticleReaderContent = data.blogContent ?? receipt?.content ?? legacyBlogContent(article.id, { ...data, body: data.body! });
    if (!receipt) content = await attribute(data, content);
    content = { ...content, legacyHeaderMediaIds: blogHeaderMediaIds(content, data), ...correctionsFor(data, receipt) };
    return postFrom(article.id, data, content, now());
  }
  async function previousGrants(tx: Transaction, articleId: string) {
    const listed: MediaPublicationGrant[] = [];
    let after: string | undefined;
    do {
      const page = await tx.page({ kind: "publicationGrant", articleId, ...(after ? { after } : {}) });
      listed.push(...page.items.map(item => parseStoredMedia(grantSchema, item.body)));
      after = page.items.length ? page.next : undefined;
    } while (after);
    // Removal needs a point read of each grant, which the page alone does not provide.
    await Promise.all(listed.map(grant => tx.read("publicationGrant", grantId(grant))));
    return listed;
  }
  return {
    isOperator: id => identity.isOperator(id),
    read: id => persistence.snapshot(async reader => readPost(reader, await reader.read("article", id))),
    async list(cursor) {
      const boundary = cursor && /^[a-zA-Z0-9_-]{1,128}$/.test(cursor) ? await persistence.read("article", cursor) : null;
      const after = boundary && Number.isFinite(boundary.body.createdAt) ? JSON.stringify([boundary.body.createdAt, "", boundary.id]) : undefined;
      const page = await readPages(persistence, { kind: "article", order: "createdDesc", ...(after ? { after } : {}) }, pageSize);
      const at = now();
      const items: BlogPostSummary[] = page.flatMap((record) => {
        if (!isBlogArticle(record)) return [];
        const data = articleData(record);
        return [{ id: record.id, title: data.title, status: data.status === "published" ? "published" as const : "draft" as const,
          ...(Number.isFinite(data.publishedAt) ? { publishedAt: data.publishedAt } : {}),
          ...(isScheduled(data, at) ? { scheduled: true } : {}) }];
      });
      return { items, ...(page.length === pageSize ? { nextCursor: page.at(-1)!.id } : {}) };
    },
    transact: (id, decide) => transactMedia(persistence, async (tx) => {
      const article = await tx.read("article", id);
      const replaced = await previousGrants(tx, id);
      const previous = await readPost(tx, article);
      const receiptId = blogOperationId(id);
      await tx.read("publicationReceipt", receiptId);
      return decide({
        read: async () => previous,
        // Each Media is read with the grant slot this post would hold, so `save` can stay synchronous.
        readMedia: async (ids) => {
          const records = await Promise.all(ids.map(async (mediaId) => {
            const [record] = await Promise.all([tx.read("media", mediaId), tx.read("publicationGrant", grantId({ operationId: receiptId, mediaId }))]);
            return record ? toMedia(record) : null;
          }));
          return records.filter((item): item is Media => item !== null);
        },
        hasMediaUsePermission: permissions.hasMediaUsePermission,
        save(post, media) {
          const published = post.status === "published";
          const active: MediaPublicationGrant[] = published ? media.map(item => ({ operationId: receiptId, articleId: id, mediaId: item.id, revision: item.revision, digest: item.digest! })) : [];
          const pendingMediaPurges = retirementKeys(article ? articleData(article).pendingMediaPurges : undefined, replaced, active);
          const retained = new Set(active.map(grantId));
          for (const grant of replaced) if (!retained.has(grantId(grant))) tx.remove("publicationGrant", grantId(grant));
          for (const grant of active) tx.put({ kind: "publicationGrant", id: grantId(grant), body: recordBody(grant) });
          if (published) {
            for (const item of media) if (item.status === "staged") tx.put(mediaRecord({ ...item, status: "active", updatedAt: post.updatedAt }));
            tx.put({ kind: "publicationReceipt", id: receiptId, body: recordBody(blogPublicationReceipt(id, post, active, previous)) });
          }
          tx.put({ kind: "article", id, body: articleBody(article?.body, id, post, pendingMediaPurges) });
        },
      });
    }),
  };
}

const candidateSchema = z.looseObject({
  status: z.string(), title: z.string(), slug: z.string(), storyId: z.string().optional(),
  mediaIds: z.array(z.string()).optional(), publishedAt: z.number().optional(), updatedAt: z.number(),
});

/** The canonical state the public index converges to; a Redação article without a story keeps its own ID as story. */
export function articleIndexCandidate(record: StoredRecord): PublicArticleIndexCandidate {
  const data = parseStoredMedia(candidateSchema, record.body);
  return { id: record.id, storyId: data.storyId ?? record.id, title: data.title, slug: data.slug, mediaIds: data.mediaIds ?? [],
    status: data.status, updatedAt: data.updatedAt, ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}) };
}

export async function readArticleIndexCandidate(persistence: Pick<EditorialPersistence, "read">, id: string): Promise<PublicArticleIndexCandidate | null> {
  const record = await persistence.read("article", id);
  return record && articleIndexCandidate(record);
}
