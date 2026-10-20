import type { PurgeFailureCause, PurgeVerificationFailure } from "@tudomacae/public-image-delivery/purge";
import type { MediaPublicationGrant } from "@tudomacae/media/publicationGrants";
import { editorialImageKey, parseEditorialImageKey } from "@tudomacae/public-image-delivery/editorial";

export type ArticleMediaCleanupFailureCause = PurgeFailureCause | "dependency" | "invalid-key" | "conflict";

class MediaCleanupFailure extends Error {
  constructor(readonly reason: ArticleMediaCleanupFailureCause, readonly verification?: PurgeVerificationFailure) {
    super("Editorial image cleanup unconfirmed");
  }
}

export interface ArticleMediaCleanupResult {
  status: "confirmed" | "unconfirmed";
}

export function retirementKeys(pending: string[] | undefined, previous: MediaPublicationGrant[], active: MediaPublicationGrant[]): string[] {
  const retained = new Set(active.map(grant => editorialImageKey(grant.mediaId, grant.digest)));
  return [...new Set([...(pending ?? []), ...previous.flatMap((grant) => {
    const key = editorialImageKey(grant.mediaId, grant.digest);
    return key && !retained.has(key) ? [key] : [];
  })])];
}

export interface ArticleMediaCleanupDependencies {
  readPending(articleId: string): Promise<{ version: number; keys: string[] } | null>;
  isPublic(key: string): Promise<boolean>;
  purge(keys: string[]): Promise<{ success: boolean; cause?: PurgeFailureCause; verification?: PurgeVerificationFailure }>;
  complete(articleId: string, version: number): Promise<boolean>;
  failed(stage: "pending" | "public-use" | "purge" | "completion", correlationId: string | undefined, cause: ArticleMediaCleanupFailureCause, articleId: string, verification?: PurgeVerificationFailure): void;
}

type CleanupStage = Parameters<ArticleMediaCleanupDependencies["failed"]>[0];

export function createArticleMediaCleanup(dependencies: ArticleMediaCleanupDependencies) {
  async function retiredKeys(keys: string[]) {
    const retired: string[] = [];
    for (const key of new Set(keys)) {
      if (!parseEditorialImageKey(key)) throw new MediaCleanupFailure("invalid-key");
      if (!await dependencies.isPublic(key)) retired.push(key);
    }
    return retired;
  }
  async function purgeRetired(retired: string[]) {
    if (!retired.length) return;
    const purge = await dependencies.purge(retired);
    if (!purge.success) throw new MediaCleanupFailure(purge.cause ?? "provider", purge.verification);
  }
  function reportFailure(stage: CleanupStage, correlationId: string | undefined, articleId: string, error: unknown) {
    if (!(error instanceof MediaCleanupFailure)) return dependencies.failed(stage, correlationId, "dependency", articleId);
    if (error.verification) return dependencies.failed(stage, correlationId, error.reason, articleId, error.verification);
    dependencies.failed(stage, correlationId, error.reason, articleId);
  }
  return {
    async synchronize(articleId: string, correlationId?: string): Promise<ArticleMediaCleanupResult> {
      let stage: CleanupStage = "pending";
      try {
        const pending = await dependencies.readPending(articleId);
        if (!pending) return { status: "unconfirmed" };
        if (!pending.keys.length) return { status: "confirmed" };
        stage = "public-use";
        const retired = await retiredKeys(pending.keys);
        stage = "purge";
        await purgeRetired(retired);
        stage = "completion";
        if (!await dependencies.complete(articleId, pending.version)) throw new MediaCleanupFailure("conflict");
        return { status: "confirmed" };
      }
      catch (error) {
        reportFailure(stage, correlationId, articleId, error);
        return { status: "unconfirmed" };
      }
    },
  };
}
