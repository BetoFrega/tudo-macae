import { createHash } from "node:crypto";

export function adImageCleanupJobId(path: string, kind: "upload" | "remove" = "remove"): string {
  return createHash("sha256").update(`${kind}:${path}`).digest("hex");
}

export function adImageCleanupPurgeOperationId(correlationId: string, path: string): string {
  return `${correlationId}:${adImageCleanupJobId(path)}`;
}

const hourMs = 60 * 60_000;

/**
 * Delay before a deferred cleanup job is due again: one hour, doubling per
 * prior attempt up to a day. A job is never terminated by age, so a late
 * upload is still revoked; backoff only bounds the recurring cost of jobs
 * whose bytes never arrive.
 */
export function adImageCleanupBackoffMs(priorAttempts: number): number {
  const attempts = Number.isFinite(priorAttempts) && priorAttempts > 0 ? Math.floor(priorAttempts) : 0;
  return Math.min(hourMs * 2 ** Math.min(attempts, 5), 24 * hourMs);
}
