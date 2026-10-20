import { publicEditorName } from "./editorName";
import { slugify } from "@tudomacae/text-normalization/slugify";
import type { MediaMetadata } from "@tudomacae/media/model";

export interface ArticleSubmissionMedia { mediaId: string; expectedRevision: number; digest: string; metadata: MediaMetadata }

export interface ArticleReaderContent {
  corrections?: Array<{
    summary: string;
    createdAt: number;
    editorId?: string | undefined;
  }>;
  title: string;
  body: string;
  path: string;
  editorName?: string;
  assisted?: boolean;
  sources: Array<{
    name: string;
    url?: string;
    reportedAt?: number | null;
    accessedAt?: number;
  }>;
  media: Array<{ id: string; digest?: string; alt: string; caption: string; credit: string; generated?: boolean }>;
  leadMediaId?: string | null;
  legacyHeaderMediaIds?: string[];
}

export function articleReaderContent(input: {
  submission: {
    storyId: string;
    title: string;
    body: string;
    captureIds: string[];
    media?: ArticleSubmissionMedia[];
    leadMediaId?: string | null | undefined;
    legacyHeaderMediaIds?: string[] | undefined;
    editorialClientId?: string;
    editorialDelegationId?: string;
  };
  evidence: Array<{
    capture: { id: string; sourceUrl: string; reportedAt?: number | null; accessedAt?: number };
    source: { name: string };
  }>;
  editorName: string;
}): ArticleReaderContent {
  const { submission } = input;
  const sources = input.evidence.filter(item => submission.captureIds.includes(item.capture.id))
    .map(item => ({
      name: item.source.name,
      url: item.capture.sourceUrl,
      ...(item.capture.reportedAt !== undefined ? { reportedAt: item.capture.reportedAt } : {}),
      ...(item.capture.accessedAt !== undefined ? { accessedAt: item.capture.accessedAt } : {}),
    }));
  return {
    title: submission.title,
    body: submission.body,
    path: `/noticia/${encodeURIComponent(submission.storyId)}/${slugify(submission.title)}`,
    editorName: publicEditorName(input.editorName) ?? "Redação Tudo Macaé",
    assisted: submission.editorialClientId !== undefined
      || submission.editorialDelegationId !== undefined,
    sources,
    media: (submission.media ?? []).map(item => ({
      id: item.mediaId,
      alt: item.metadata.alt,
      caption: item.metadata.caption,
      credit: item.metadata.provenance.credit,
      generated: item.metadata.provenance.origin === "generated",
    })),
    ...(submission.leadMediaId !== undefined
      ? { leadMediaId: submission.leadMediaId }
      : {}),
    ...(submission.legacyHeaderMediaIds !== undefined
      ? { legacyHeaderMediaIds: submission.legacyHeaderMediaIds }
      : {}),
  };
}
