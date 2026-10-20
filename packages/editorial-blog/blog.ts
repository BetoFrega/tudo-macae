import { z } from "zod";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { mediaMetadataSchema, type Media } from "@tudomacae/media/model";
import { sanitizedMediaPath } from "@tudomacae/media/sanitizedContent";
import type { ArticleReaderContent } from "./articleReader";
import { articleMediaUseIds } from "./articleMediaBody";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const mediaReferencesSchema = z.array(z.string().min(1).max(200)).max(20);
export const savePostSchema = z.strictObject({
  id: id.optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1, "Informe o título.").max(500),
  body: z.string().min(1, "Escreva o texto.").max(200000).refine(value => value.trim().length > 0, "Escreva o texto."),
  leadMediaId: id.nullable().optional(),
  publish: z.boolean().optional(),
}).superRefine((input, context) => {
  if (!mediaReferencesSchema.safeParse(articleMediaUseIds(input)).success) {
    context.addIssue({ code: "custom", path: ["body"], message: "Use até 20 imagens com identificadores de até 200 caracteres." });
  }
});
export const postRevisionSchema = z.strictObject({ id, expectedRevision: z.number().int().nonnegative() });
export type SavePostInput = z.input<typeof savePostSchema>;
export interface BlogPost {
  id: string;
  status: "draft" | "published";
  revision: number;
  content: ArticleReaderContent;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  scheduled?: boolean;
  mediaIds: string[];
  createdBy?: string;
}
export interface BlogPostSummary { id: string; title: string; status: "draft" | "published"; publishedAt?: number; scheduled?: boolean }
export interface BlogTransaction {
  read(): Promise<BlogPost | null>;
  readMedia(ids: string[]): Promise<Media[]>;
  hasMediaUsePermission(permissionId: string, at: number): Promise<boolean>;
  save(post: BlogPost, media: Media[]): void;
}
export interface BlogDependencies {
  now(): number;
  newId(): string;
  isOperator(id: string): Promise<boolean>;
  read(id: string): Promise<BlogPost | null>;
  list(cursor?: string): Promise<{ items: BlogPostSummary[]; nextCursor?: string }>;
  transact<T>(id: string, decide: (transaction: BlogTransaction) => Promise<T>): Promise<T>;
  synchronize(id: string, correlationId?: string): Promise<"confirmed" | "unconfirmed">;
}
export class BlogError extends Error {
  constructor(public readonly code: "forbidden" | "notFound" | "conflict" | "media", message: string, public readonly field?: "body" | "leadMediaId") {
    super(message);
    this.name = "BlogError";
  }
}
type ParsedSavePost = z.output<typeof savePostSchema>;

function draftContent(parsed: ParsedSavePost, postId: string, previous: BlogPost | null): ArticleReaderContent {
  return {
    ...(previous?.content ?? { sources: [], media: [] }),
    title: parsed.title,
    body: parsed.body,
    path: previous?.content.path ?? `/noticia/${postId}/${slugify(parsed.title)}`,
    ...(parsed.leadMediaId !== undefined ? { leadMediaId: parsed.leadMediaId, legacyHeaderMediaIds: [] } : {}),
  };
}

function mediaField(content: ArticleReaderContent, mediaId: string) {
  return articleMediaUseIds({ body: content.body }).includes(mediaId) ? "body" as const : "leadMediaId" as const;
}

function isPublishableMedia(item: Media) {
  return Boolean(item.digest && sanitizedMediaPath(item, item.digest))
    && mediaMetadataSchema.safeParse({ kind: item.kind, alt: item.alt, caption: item.caption, provenance: item.provenance }).success;
}

function assertMediaAvailable(content: ArticleReaderContent, mediaIds: string[], media: Media[]) {
  const unavailable = mediaIds.find(mediaId => !media.some(item => item.id === mediaId && isPublishableMedia(item)));
  if (unavailable) {
    throw new BlogError("media", "Imagem indisponível. Remova ou substitua a imagem antes de salvar.", mediaField(content, unavailable));
  }
}

function permissionReference(item: Media) {
  return item.provenance.displayBasis === "permission" ? item.provenance.permissionReference : undefined;
}

async function assertMediaPermissions(transaction: BlogTransaction, content: ArticleReaderContent, media: Media[], at: number) {
  const permissionIds = [...new Set(media.flatMap(item => item.provenance.displayBasis === "permission" ? [item.provenance.permissionReference] : []))];
  const permissions = await Promise.all(permissionIds.map(permissionId => transaction.hasMediaUsePermission(permissionId, at)));
  const invalidPermission = permissionIds.find((_, index) => !permissions[index]);
  if (invalidPermission) {
    const deniedMedia = media.find(item => permissionReference(item) === invalidPermission)!;
    throw new BlogError("media", "A permissão de uso da imagem não está vigente. Remova ou substitua a imagem.", mediaField(content, deniedMedia.id));
  }
}

function readerMedia(item: Media) {
  return { id: item.id, ...(item.digest ? { digest: item.digest } : {}), alt: item.alt, caption: item.caption, credit: item.provenance.credit, generated: item.provenance.origin === "generated" };
}

function authorship(previous: BlogPost | null, actorId: string) {
  if (previous?.createdBy) return { createdBy: previous.createdBy };
  return previous ? {} : { createdBy: actorId };
}

interface SavedPostInput {
  postId: string;
  previous: BlogPost | null;
  actorId: string;
  publish: boolean | undefined;
  content: ArticleReaderContent;
  mediaIds: string[];
  at: number;
}

function savedStatus(publish: boolean | undefined, previous: BlogPost | null) {
  return publish === true || previous?.status === "published" ? "published" : "draft";
}

function publicationFields(status: BlogPost["status"], previous: BlogPost | null, at: number) {
  const publishedAt = previous?.publishedAt ?? at;
  return {
    ...(status === "published" || previous?.publishedAt !== undefined ? { publishedAt } : {}),
    ...(status === "published" && publishedAt > at ? { scheduled: true } : {}),
  };
}

/** Projections order writes by `updatedAt`, so each mutation advances it even when the clock repeats or moves back. */
function nextVersion(previous: BlogPost | null, at: number) {
  return Math.max(at, (previous?.updatedAt ?? -1) + 1);
}

function nextSavedPost({ postId, previous, actorId, publish, content, mediaIds, at }: SavedPostInput): BlogPost {
  const status = savedStatus(publish, previous);
  return {
    id: postId, ...authorship(previous, actorId), status, revision: (previous?.revision ?? 0) + 1, content, mediaIds,
    createdAt: previous?.createdAt ?? at, updatedAt: nextVersion(previous, at),
    ...publicationFields(status, previous, at),
  };
}
export function createBlog(dependencies: BlogDependencies) {
  async function authorize(actorId: string) {
    if (!await dependencies.isOperator(actorId)) throw new BlogError("forbidden", "Acesso restrito a Administradores e Editores ativos.");
  }
  function checkRevision(post: BlogPost | null, revision?: number) {
    if (!post) throw new BlogError("notFound", "Post não encontrado.");
    if (post.revision !== revision) throw new BlogError("conflict", "O post foi alterado. Reabra a página antes de salvar.");
    return post;
  }
  return {
    async read(actorId: string, postId: string) {
      await authorize(actorId);
      return dependencies.read(id.parse(postId));
    },
    async list(actorId: string, cursor?: string) {
      await authorize(actorId);
      return dependencies.list(cursor);
    },
    async save(actorId: string, input: SavePostInput, correlationId?: string) {
      await authorize(actorId);
      const parsed = savePostSchema.parse(input);
      const postId = parsed.id ?? dependencies.newId();
      const post = await dependencies.transact(postId, async (transaction) => {
        const previous = parsed.id ? checkRevision(await transaction.read(), parsed.expectedRevision) : null;
        const at = dependencies.now();
        const content = draftContent(parsed, postId, previous);
        const mediaIds = articleMediaUseIds(content);
        if (!mediaReferencesSchema.safeParse(mediaIds).success) {
          throw new BlogError("media", "Use até 20 imagens com identificadores de até 200 caracteres.", "body");
        }
        const media = await transaction.readMedia(mediaIds);
        assertMediaAvailable(content, mediaIds, media);
        await assertMediaPermissions(transaction, content, media, at);
        content.media = media.map(readerMedia);
        const next = nextSavedPost({ postId, previous, actorId, publish: parsed.publish, content, mediaIds, at });
        transaction.save(next, media);
        return next;
      });
      const synchronization = await dependencies.synchronize(post.id, correlationId).catch(() => "unconfirmed" as const);
      return { post, synchronization };
    },
    async takeOffline(actorId: string, input: z.input<typeof postRevisionSchema>, correlationId?: string) {
      await authorize(actorId);
      const parsed = postRevisionSchema.parse(input);
      const post = await dependencies.transact(parsed.id, async (transaction) => {
        const previous = checkRevision(await transaction.read(), parsed.expectedRevision);
        const at = dependencies.now();
        const next: BlogPost = { ...previous, status: "draft", revision: previous.revision + 1, updatedAt: nextVersion(previous, at) };
        delete next.scheduled;
        if ((previous.publishedAt ?? 0) > at) delete next.publishedAt;
        transaction.save(next, []);
        return next;
      });
      const synchronization = await dependencies.synchronize(post.id, correlationId).catch(() => "unconfirmed" as const);
      return { post, synchronization };
    },
  };
}
