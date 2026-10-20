import { editorialImageSourceUrl } from "./editorial";
import { publicImageCacheGeneration, publicImageCacheTag } from "./cacheTag";
import { classifiedsImageSourceUrl } from "./source";

export const purgeFailureCauses = ["configuration", "authorization", "rate_limit", "provider", "timeout", "transport", "verification"] as const;
export type PurgeFailureCause = typeof purgeFailureCauses[number];
export interface PurgeVerificationFailure {
  requestId: string;
  boundary: "origin" | "worker";
  outcome: "response" | "transport";
  statusClass: "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "none";
  width?: number;
  format?: "avif" | "webp" | "jpeg";
}
export type PurgeFailure = { tags: string[]; layer: "worker" | "resizing"; cause: PurgeFailureCause; files?: string[] };
export type PurgeResult = { success: boolean; attempts: number; failures: PurgeFailure[] };

export interface PublicImagePurgeTarget {
  layer: "worker" | "resizing";
  tags: string[];
  files: string[];
}

export interface PublicImagePurgeAdapter {
  isConfigured(): boolean;
  purge(target: PublicImagePurgeTarget, signal: AbortSignal): Promise<{
    success: boolean;
    cause: PurgeFailureCause;
    retryable: boolean;
  }>;
}

interface PublicImagePurgerDependencies {
  adapter: PublicImagePurgeAdapter;
  editorialOrigin?: string | undefined;
  classifiedsOrigin?: string;
  attemptTimeoutMs?: number;
  wait(milliseconds: number): Promise<void>;
}

/** The resized source a key was delivered from: the editorial origin, or the Classifieds Worker for Ad/Profile keys. */
function purgeSource(dependencies: PublicImagePurgerDependencies, key: string): string | null {
  const source = key.startsWith("editorial/")
    ? editorialImageSourceUrl(key, dependencies.editorialOrigin ?? "")
    : classifiedsImageSourceUrl(key, dependencies.classifiedsOrigin ?? "");
  if (!source) return null;
  const url = new URL(source);
  url.searchParams.set("cache_generation", publicImageCacheGeneration);
  return url.href;
}

function isPurgeConfigured(dependencies: PublicImagePurgerDependencies, keys: readonly string[]): boolean {
  return dependencies.adapter.isConfigured() && keys.every(key => purgeSource(dependencies, key) !== null);
}

function purgeFiles(dependencies: PublicImagePurgerDependencies, keys: readonly string[]): string[] {
  return keys.map(key => purgeSource(dependencies, key)!);
}

// Up to three attempts per target; a non-retryable provider answer stops early.
async function purgeWithRetries(
  dependencies: PublicImagePurgerDependencies,
  target: PublicImagePurgeTarget,
): Promise<{ attempts: number; cause?: PurgeFailureCause }> {
  let cause: PurgeFailureCause = "provider";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let retryable = true;
    const signal = AbortSignal.timeout(dependencies.attemptTimeoutMs ?? 3000);
    try {
      const result = await dependencies.adapter.purge(target, signal);
      if (result.success) return { attempts: attempt };
      cause = result.cause;
      retryable = result.retryable;
    }
    catch {
      cause = signal.aborted ? "timeout" : "transport";
    }
    if (!retryable) return { attempts: attempt, cause };
    if (attempt < 3) await dependencies.wait(100 * attempt);
  }
  return { attempts: 3, cause };
}

export function createPublicImagePurger(dependencies: PublicImagePurgerDependencies) {
  async function purgeMany(keys: readonly string[]): Promise<PurgeResult> {
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) return { success: true, attempts: 0, failures: [] };
    const tags = await Promise.all(uniqueKeys.map(publicImageCacheTag));
    if (!isPurgeConfigured(dependencies, uniqueKeys)) {
      return { success: false, attempts: 0, failures: [{ tags, layer: "worker", cause: "configuration" }, { tags, layer: "resizing", cause: "configuration" }] };
    }

    let attempts = 0;
    const failures: PurgeFailure[] = [];
    // Each key yields one tag and one file; a Cloudflare purge request accepts at most 100 of either.
    const batchSize = 100;
    for (let offset = 0; offset < tags.length; offset += batchSize) {
      const batch = tags.slice(offset, offset + batchSize);
      const files = purgeFiles(dependencies, uniqueKeys.slice(offset, offset + batchSize));
      for (const layer of ["worker", "resizing"] as const) {
        const outcome = await purgeWithRetries(dependencies, { layer, tags: batch, files });
        attempts += outcome.attempts;
        if (outcome.cause) failures.push({
          tags: batch,
          layer,
          cause: outcome.cause,
          ...(layer === "resizing" ? { files } : {}),
        });
      }
    }
    return { success: failures.length === 0, attempts, failures };
  }
  return {
    purge: (key: string) => purgeMany([key]),
    purgeMany,
  };
}
