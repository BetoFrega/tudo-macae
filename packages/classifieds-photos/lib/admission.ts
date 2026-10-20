import { PhotoUploadLimited, type PhotoTransaction } from "./contracts";

const day = 24 * 60 * 60_000;
export async function admitPhotoUpload(tx: PhotoTransaction, accountId: string, operationId: string, now: number) {
  const account = await tx.quota(accountId);
  const global = await tx.quota(null);
  const accountUploads = account.uploads.filter(time => time > now - day).sort((a, b) => a - b);
  const globalUploads = global.uploads.filter(time => time > now - day).sort((a, b) => a - b);
  const burst = accountUploads.filter(time => time > now - 300_000);
  const limits = [
    { reason: "account_burst" as const, uploads: burst, limit: 20, window: 300_000 },
    { reason: "account_daily" as const, uploads: accountUploads, limit: 100, window: day },
    { reason: "global_daily" as const, uploads: globalUploads, limit: 1000, window: day },
  ];
  const blocked = limits.filter(rule => rule.uploads.length >= rule.limit)
    .map(rule => ({ reason: rule.reason, retryAfterMs: rule.uploads[rule.uploads.length - rule.limit]! + rule.window - now }))
    .sort((a, b) => b.retryAfterMs - a.retryAfterMs)[0];
  if (blocked) throw new PhotoUploadLimited(blocked.reason, blocked.retryAfterMs);
  // One warning per rolling 24h window, never one per request; it expires with the window so a later crossing warns again.
  const { warning: priorWarning, ...globalRest } = global;
  const activeWarning = priorWarning && priorWarning.createdAt > now - day ? priorWarning : undefined;
  const warning = globalUploads.length + 1 >= 800 && !activeWarning;
  tx.saveQuota(accountId, { ...account, uploads: [...accountUploads, now] });
  const nextWarning = warning ? { operationId, createdAt: now } : activeWarning;
  tx.saveQuota(null, { ...globalRest, uploads: [...globalUploads, now], ...(nextWarning ? { warning: nextWarning } : {}) });
  return warning;
}
