import type { EditorialPersistence, RecordBody, StoredRecord } from "@tudomacae/editorial-persistence";
import { legacyBlogContent } from "@tudomacae/editorial-blog/blogRecords";
import { slugify } from "@tudomacae/text-normalization/slugify";
import { readPages, recordBody, transactMedia } from "./db/editorialMedia";
import type { WorkerDependencies } from "./workerDependencies";

// Bounds one hourly run; the rest waits for the next run.
const articlesPerRun = 25;

const hasLegacyText = (record: StoredRecord | null): record is StoredRecord => typeof record?.body.body === "string";

/**
 * The article's text kept only in `blogContent`: an existing `blogContent` wins; otherwise the published edition's
 * reader content carries the article's own title and text, which a Redação edit after publication may have changed.
 */
function migratedBody(article: StoredRecord, receipt: StoredRecord | null): RecordBody {
  const { body: text, ...kept } = article.body;
  if (kept.blogContent) return recordBody(kept);
  const published = receipt?.body.content;
  const title = String(kept.title);
  const blogContent = published && typeof published === "object"
    ? { ...published, title, body: text }
    : legacyBlogContent(article.id, { ...kept, title, body: String(text), slug: typeof kept.slug === "string" ? kept.slug : slugify(title) });
  return recordBody({ ...kept, blogContent });
}

/** Moves the text of articles saved before the Blog dropped the top-level `body`, one transaction per article. */
export async function migrateArticleText(persistence: EditorialPersistence, limit = articlesPerRun) {
  const pending = (await readPages(persistence, { kind: "article" })).filter(hasLegacyText).map(record => record.id);
  let migrated = 0;
  for (const id of pending.slice(0, limit)) {
    migrated += await transactMedia(persistence, async (tx) => {
      const article = await tx.read("article", id);
      // A save since the scan already dropped the text.
      if (!hasLegacyText(article)) return 0;
      const receiptId = article.body.publicationReceiptId;
      const receipt = typeof receiptId === "string" && receiptId ? await tx.read("publicationReceipt", receiptId) : null;
      tx.put({ kind: "article", id, body: migratedBody(article, receipt) });
      return 1;
    });
  }
  return { migrated, remaining: pending.length - migrated };
}

function migrationEvent(env: Env) {
  return { event: "editorial_article_text_migration", service: "api-worker", environment: env.WORKERS_ENVIRONMENT ?? "unknown", release: env.CF_VERSION_METADATA?.id ?? "unknown" };
}

/**
 * Runs hourly under the `worker` authority until no article keeps a top-level `body`.
 * @expires 2026-11-16 remove with the legacy article reader once production logs `remaining: 0`
 */
export async function runArticleTextMigration(dependencies: WorkerDependencies, env: Env) {
  const service = dependencies.editorialMedia?.(env);
  if (!service) return;
  const base = migrationEvent(env);
  try {
    if (await service.authority() !== "worker") return;
    const result = await migrateArticleText(service.persistence);
    // Counts only; article IDs and text stay out of the log.
    if (result.migrated || result.remaining) console.info(JSON.stringify({ ...base, outcome: "completed", ...result }));
  }
  catch (error) {
    console.error(JSON.stringify({ ...base, outcome: "failed", errorName: error instanceof Error ? error.name : "unknown" }));
    throw error;
  }
}
