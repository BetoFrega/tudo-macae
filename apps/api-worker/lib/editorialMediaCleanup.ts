import { createArticleMediaCleanup, type ArticleMediaCleanupResult } from "@tudomacae/editorial-blog/mediaCleanup";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import type { EditorialImagePurge } from "@tudomacae/public-image-delivery/editorialPurge";
import type { PurgeVerificationFailure } from "@tudomacae/public-image-delivery/purge";
import { parseEditorialImageKey } from "@tudomacae/public-image-delivery/editorial";
import { z } from "zod";
import { editorialPublicMedia } from "./editorialImageHttp";

const pendingSchema = z.object({ updatedAt: z.number(), pendingMediaPurges: z.array(z.string()).optional() });

/**
 * The verified purge of an article's retired Media over the editorial D1. The article's `pendingMediaPurges` is the
 * durable intent: it clears only after every key still unpublished is purged and verified absent, and only while the
 * article keeps the version that was read, so a later save repeats the work.
 */
export function createEditorialMediaCleanup(dependencies: {
  persistence: EditorialPersistence;
  purge: EditorialImagePurge;
  context: { environment: string; release: string };
  now?: () => number;
  /** The cleanup's share of the Blog write; past it the save answers `unconfirmed` and the intent stays pending. */
  budgetMs?: number;
}) {
  const { persistence } = dependencies;
  // Deciding public use reads no bytes.
  const media = editorialPublicMedia(persistence, async () => null, dependencies.now);
  function report(stage: string, correlationId: string | undefined, cause: string, articleId: string, verification?: PurgeVerificationFailure) {
    const event = JSON.stringify({
      event: "public-image-purge", service: "api-worker", ...dependencies.context,
      outcome: cause === "conflict" ? "superseded" : "failed", imageClass: "editorial", operation: "editorial_media_cleanup",
      stage, cause, articleId,
      ...(correlationId && /^[a-zA-Z0-9_-]{1,128}$/.test(correlationId) ? { correlationId } : {}),
      ...(verification ? { verification } : {}),
    });
    if (cause === "conflict") console.info(event);
    else console.error(event);
  }
  const cleanup = createArticleMediaCleanup({
    async readPending(articleId) {
      const record = await persistence.read("article", articleId);
      if (!record) return null;
      const article = pendingSchema.parse(record.body);
      return { version: article.updatedAt, keys: article.pendingMediaPurges ?? [] };
    },
    async isPublic(key) {
      const parsed = parseEditorialImageKey(key);
      return !!parsed && media.isPublic(parsed.mediaId, parsed.digest);
    },
    purge: dependencies.purge,
    async complete(articleId, version) {
      const { value } = await persistence.transact(null, async (tx) => {
        const record = await tx.read("article", articleId);
        if (!record || record.body.updatedAt !== version) return false;
        tx.put({ kind: "article", id: articleId, body: { ...record.body, pendingMediaPurges: [] } });
        return true;
      });
      return value;
    },
    failed: report,
  });
  // The Blog client gives a write 30 seconds and the article commits before this runs, so the purge never holds the answer past the budget.
  const budgetMs = dependencies.budgetMs ?? 15_000;
  return {
    async synchronize(articleId: string, correlationId?: string): Promise<ArticleMediaCleanupResult> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<ArticleMediaCleanupResult>((resolve) => {
        timer = setTimeout(() => {
          report("purge", correlationId, "deadline", articleId);
          resolve({ status: "unconfirmed" });
        }, budgetMs);
      });
      try {
        return await Promise.race([cleanup.synchronize(articleId, correlationId), expired]);
      }
      finally {
        clearTimeout(timer);
      }
    },
  };
}
