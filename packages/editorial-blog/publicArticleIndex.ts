import { articleIsVisible } from "@tudomacae/editorial-planning/eligibility";
import type { PublicArticleIndexCandidate, PublicArticleSummary } from "./articleDistribution";

export type { PublicArticleIndexCandidate, PublicArticleSummary };

export interface PublicArticleIndexDependencies {
  listCandidates(at: number): Promise<PublicArticleIndexCandidate[]>;
}

const encoder = new TextEncoder();

/** Matches Firestore document-ID ordering and SQLite's explicit BINARY collation. */
function compareIdsDescending(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return rightBytes[index] - leftBytes[index];
  }
  return rightBytes.length - leftBytes.length;
}

function comparePublicArticles(left: PublicArticleSummary, right: PublicArticleSummary) {
  return right.publishedAt - left.publishedAt || compareIdsDescending(left.id, right.id);
}

/**
 * A narrow, read-only discovery index. It deliberately does not expose a
 * public Article: a caller that needs its body or publication guarantees must
 * use ArticleCatalog instead.
 */
export function createPublicArticleIndex(dependencies: PublicArticleIndexDependencies) {
  return {
    async list(at: number, limit?: number): Promise<PublicArticleSummary[]> {
      const articles = (await dependencies.listCandidates(at))
        .filter((article): article is PublicArticleIndexCandidate & { publishedAt: number } => articleIsVisible(article, at))
        .map(({ status: _status, ...summary }) => summary);
      const ordered = [...articles].sort(comparePublicArticles);
      return limit === undefined ? ordered : ordered.slice(0, limit);
    },
  };
}
