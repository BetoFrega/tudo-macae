import { articleIsVisible } from "@tudomacae/editorial-planning/eligibility";
import { samePublicationGrant, type MediaPublicationGrant } from "@tudomacae/media/publicationGrants";
import type { Media } from "@tudomacae/media/model";
import { publicEditorName } from "./editorName";
import type { ArticleReaderContent } from "./articleReader";
import { parseArticleBodyMediaReferences } from "./articleMediaBody";
import { resolveLegacyHeaderMediaIds } from "./articleMediaRoles";

/** The fields of a publication receipt the public reader decides on; every editorial receipt carries them. */
export interface ArticleEditionReceipt {
  operationId: string;
  articleId: string;
  status: string;
  content: ArticleReaderContent;
  grants: MediaPublicationGrant[];
  corrections?: Array<{ summary: string; createdAt: number; editorId?: string | undefined }> | undefined;
  publicUpdatedAt?: number | undefined;
}

export interface PublicationReadState<
  Receipt extends ArticleEditionReceipt = ArticleEditionReceipt,
> {
  managed: boolean;
  article: { status: string; receiptId: string; publishedAt: number } | null;
  receipt: Receipt | null;
  grants: MediaPublicationGrant[];
}

export function publishedReceipt<Receipt extends ArticleEditionReceipt>(
  articleId: string,
  state: PublicationReadState<Receipt>,
  now: number,
): Receipt | null {
  const { article, receipt, grants } = state;
  if (!article || !articleIsVisible(article, now) || !receipt || receipt.status !== "completed"
    || receipt.articleId !== articleId || receipt.operationId !== article.receiptId
    || grants.length !== receipt.grants.length
    || !grants.every((grant, index) => samePublicationGrant(grant, receipt.grants[index]))) return null;
  return receipt;
}

export interface PublishedSubmissionDependencies {
  now(): number;
  readPublication(articleId: string): Promise<PublicationReadState>;
  readMedia(ids: string[]): Promise<Media[]>;
}

type ReaderResult<Kind extends string> = { kind: Kind; content: ArticleReaderContent; publishedAt: number; updatedAt?: number } | { kind: "unavailable" };

async function readCompleteReceipt<Kind extends string>(
  dependencies: PublishedSubmissionDependencies,
  state: PublicationReadState,
  kind: Kind,
  selectReceipt: (state: PublicationReadState, now: number) => ArticleEditionReceipt | null,
): Promise<ReaderResult<Kind>> {
  const receipt = selectReceipt(state, dependencies.now());
  if (!receipt) return { kind: "unavailable" };
  const media = await dependencies.readMedia(receipt.grants.map(item => item.mediaId));
  if (receipt.grants.some(grant =>
    !media.some(item => item.id === grant.mediaId && item.digest === grant.digest)
    || !receipt.content.media.some(item => item.id === grant.mediaId))) {
    return { kind: "unavailable" };
  }
  const editorName = receipt.content.editorName === undefined
    ? undefined
    : publicEditorName(receipt.content.editorName) ?? "Redação Tudo Macaé";
  return { kind, publishedAt: state.article!.publishedAt,
    ...(receipt.publicUpdatedAt !== undefined
      ? { updatedAt: receipt.publicUpdatedAt }
      : {}),
    content: { ...receipt.content,
      corrections: receipt.corrections ?? [],
      ...(editorName ? { editorName } : {}),
      legacyHeaderMediaIds: resolveLegacyHeaderMediaIds({
        mediaIds: receipt.content.media.map(item => item.id),
        ...(receipt.content.leadMediaId !== undefined ? { leadMediaId: receipt.content.leadMediaId } : {}),
        ...(receipt.content.legacyHeaderMediaIds !== undefined
          ? { legacyHeaderMediaIds: receipt.content.legacyHeaderMediaIds }
          : {}),
        bodyHasMedia: parseArticleBodyMediaReferences(receipt.content.body).length > 0,
      }),
      media: receipt.grants.map((grant) => {
        const current = media.find(item => item.id === grant.mediaId)!;
        return {
          id: current.id,
          ...(current.digest ? { digest: current.digest } : {}),
          alt: current.alt,
          caption: current.caption,
          credit: current.provenance.credit,
          generated: current.provenance.origin === "generated",
        };
      }),
    } };
}

export function createPublishedSubmissionReader(dependencies: PublishedSubmissionDependencies) {
  return {
    async read(articleId: string): Promise<{ kind: "legacy" | "unavailable" } | Exclude<ReaderResult<"published">, { kind: "unavailable" }>> {
      const state = await dependencies.readPublication(articleId);
      if (!state.managed) return { kind: "legacy" };
      return readCompleteReceipt(dependencies, state, "published", (current, now) => publishedReceipt(articleId, current, now)) as Promise<{ kind: "unavailable" } | Exclude<ReaderResult<"published">, { kind: "unavailable" }>>;
    },
  };
}
