import type { PublicArticleSummary } from "./publicArticleIndex";

const fields = ["storyId", "title", "slug", "mediaIds", "publishedAt", "updatedAt"] as const;
export function comparePublicArticleIndexes(canonical: PublicArticleSummary[], projected: PublicArticleSummary[]): string[] {
  const differences: string[] = [];
  if (canonical.length !== projected.length) differences.push(`count: canonical=${canonical.length} index=${projected.length}`);
  const byId = new Map(projected.map(row => [row.id, row]));
  const canonicalIds = new Set(canonical.map(row => row.id));
  for (const row of canonical) {
    const other = byId.get(row.id);
    if (!other) {
      differences.push(`missing: ${row.id}`);
      continue;
    }
    for (const field of fields) {
      if (JSON.stringify(row[field]) !== JSON.stringify(other[field])) differences.push(`field: ${row.id}.${field}`);
    }
  }
  for (const row of projected) if (!canonicalIds.has(row.id)) differences.push(`extra: ${row.id}`);
  if (canonical.length === projected.length && canonical.some((row, index) => row.id !== projected[index]?.id)) differences.push("order: article IDs differ");
  return differences;
}

export function createPublicArticleIndexReconciliation(dependencies: {
  listCanonical(): Promise<PublicArticleSummary[]>;
  replace(rows: PublicArticleSummary[]): Promise<void>;
  listProjection(): Promise<PublicArticleSummary[]>;
}) {
  return {
    async run(apply: boolean) {
      const canonical = await dependencies.listCanonical();
      if (apply) await dependencies.replace(canonical);
      return comparePublicArticleIndexes(canonical, await dependencies.listProjection());
    },
  };
}
