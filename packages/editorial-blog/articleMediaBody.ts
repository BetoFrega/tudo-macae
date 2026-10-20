import { unified } from "unified";
import remarkParse from "remark-parse";
import { articleHeaderMediaIds } from "./articleMediaRoles";

const markdown = unified().use(remarkParse);
const mediaIdentity = /^media:([^/\s?#]+)$/;

export interface ArticleBodyMediaReference {
  mediaId: string;
  start: number;
  end: number;
}

/** Stable Markdown identity for a canonical Media record. */
export function formatArticleMediaReference(mediaId: string): string {
  if (!mediaId.trim() || /[\/\s?#]/.test(mediaId)) {
    throw new TypeError("Informe uma identidade canônica de Mídia válida.");
  }
  return `![media](media:${mediaId})`;
}

function mediaReferenceFromNode(node: Record<string, unknown>): ArticleBodyMediaReference | null {
  if (node.type !== "image" || typeof node.url !== "string") return null;
  const match = mediaIdentity.exec(node.url);
  const position = node.position as { start?: { offset?: number }; end?: { offset?: number } } | undefined;
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (!match || start === undefined || end === undefined) return null;
  return { mediaId: match[1]!, start, end };
}

function childNodes(node: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(node.children)) return [];
  return node.children.filter((child): child is Record<string, unknown> => typeof child === "object" && child !== null);
}

/**
 * Reads only Markdown image nodes. Fenced/inline code, escaped Markdown and raw
 * HTML are not Article Media uses.
 */
export function parseArticleBodyMediaReferences(body: string): ArticleBodyMediaReference[] {
  const tree = markdown.parse(body) as unknown as {
    children?: Array<Record<string, unknown>>;
  };
  const references: ArticleBodyMediaReference[] = [];
  const visit = (node: Record<string, unknown>) => {
    const reference = mediaReferenceFromNode(node);
    if (reference) references.push(reference);
    for (const child of childNodes(node)) visit(child);
  };
  for (const child of tree.children ?? []) visit(child);
  return references;
}

/** Deduplicated identities used by the lead role and in-body Markdown. */
export function articleMediaUseIds(input: {
  body: string;
  leadMediaId?: string | null | undefined;
  legacyHeaderMediaIds?: string[] | undefined;
}): string[] {
  return articleMediaUseIdsFromReferences(
    parseArticleBodyMediaReferences(input.body),
    input.leadMediaId,
    input.legacyHeaderMediaIds,
  );
}

function articleMediaUseIdsFromReferences(
  bodyReferences: ArticleBodyMediaReference[],
  leadMediaId?: string | null,
  legacyHeaderMediaIds?: string[],
): string[] {
  return [...new Set([
    ...articleHeaderMediaIds({
      mediaIds: [],
      ...(leadMediaId !== undefined ? { leadMediaId } : {}),
      ...(legacyHeaderMediaIds !== undefined ? { legacyHeaderMediaIds } : {}),
    }),
    ...bodyReferences.map(reference => reference.mediaId),
  ])];
}

/** Selects only explicitly used references and rejects unresolved identities. */
export function resolveArticleMediaReferences<T extends { mediaId: string }>(input: {
  body: string;
  bodyReferences?: ArticleBodyMediaReference[];
  leadMediaId?: string | null | undefined;
  legacyHeaderMediaIds?: string[] | undefined;
  references: T[];
}): T[] {
  const bodyReferences = input.bodyReferences ?? parseArticleBodyMediaReferences(input.body);
  const modernUses = input.leadMediaId !== undefined
    || input.legacyHeaderMediaIds !== undefined || bodyReferences.length > 0;
  if (!modernUses) return input.references;

  const identities = articleMediaUseIdsFromReferences(
    bodyReferences,
    input.leadMediaId,
    input.legacyHeaderMediaIds,
  );
  const byId = new Map(input.references.map(reference => [reference.mediaId, reference]));
  if (identities.some(mediaId => !byId.has(mediaId))) {
    throw new TypeError("Selecione cada Mídia usada no corpo ou como principal.");
  }
  return identities.map(mediaId => byId.get(mediaId)!);
}

export function createArticleMediaBody() {
  return {
    articleMediaUseIds,
    formatArticleMediaReference,
    parseArticleBodyMediaReferences,
    resolveArticleMediaReferences,
  };
}
