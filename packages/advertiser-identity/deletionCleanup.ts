import { adImageUploadCleanupDelayMs } from "@tudomacae/ads/imageUploadLease";
import { ownsRawAdImagePath } from "@tudomacae/ads/rawImagePath";

export interface AssociatedAdImageRecord {
  id: string;
  images?: { path?: string; pending?: boolean }[];
  pendingImageCleanupPaths?: string[];
  pendingImageCleanupClaims?: string[];
  pendingImageUploadReservations?: { path: string; expiresAt?: number }[];
}

export class ProfileDeletionImageCleanupBlocked extends Error {}

export function profileDeletionCleanupPolicy(summary: { activeReservations: number; legacyImages: number }, now: number) {
  if (summary.activeReservations) throw new ProfileDeletionImageCleanupBlocked("Aguarde o envio das fotos terminar antes de excluir o perfil.");
  if (summary.legacyImages) throw new ProfileDeletionImageCleanupBlocked("Este perfil tem fotos antigas que precisam ser removidas antes da exclusão. Exclua o anúncio publicado em Meus anúncios e tente novamente. Se for uma publicação pendente, peça ajuda ao suporte. Seus dados continuam salvos.");
  return { dueAt: now, pendingDueAt: now + adImageUploadCleanupDelayMs, writerCompleted: true as const };
}
export function ownedProfileDeletionPhoto(id: string, photoPath?: string): string | undefined {
  return photoPath?.startsWith(`profile-photos/${id}/`) ? photoPath : undefined;
}

type ProfileDeletionImageCleanupJob = { adId: string; path: string; dueAt?: number; writerCompleted?: true };
type ProfileDeletionCleanupPolicy = ReturnType<typeof profileDeletionCleanupPolicy>;

function recordImagePaths(record: AssociatedAdImageRecord) {
  const images = record.images ?? [];
  const cleanupPaths = record.pendingImageCleanupPaths ?? [];
  const cleanupClaims = record.pendingImageCleanupClaims ?? [];
  const linkedPaths = new Set(images.map(image => image.path));
  const unlinkedReservations = record.pendingImageUploadReservations?.filter(item => !linkedPaths.has(item.path)) ?? [];
  return {
    pending: new Set([
      ...images.filter(image => image.pending === true).map(image => image.path),
      ...cleanupPaths,
      ...cleanupClaims,
    ]),
    completed: new Set(images.filter(image => image.pending !== true).map(image => image.path)),
    all: new Set([
      ...images.map(image => image.path).filter((path): path is string => typeof path === "string"),
      ...cleanupPaths,
      ...cleanupClaims,
      ...unlinkedReservations.map(item => item.path),
    ]),
    unlinkedReservations,
  };
}

function hasActiveReservation(reservations: readonly { expiresAt?: number }[], now: number) {
  return reservations.some(item => !Number.isFinite(item.expiresAt) || item.expiresAt! > now);
}

function cleanupJob(
  adId: string,
  path: string,
  paths: ReturnType<typeof recordImagePaths>,
  policy: ProfileDeletionCleanupPolicy,
): ProfileDeletionImageCleanupJob {
  return {
    adId, path,
    ...(paths.completed.has(path) ? { writerCompleted: policy.writerCompleted } : {}),
    ...(paths.pending.has(path) ? { dueAt: policy.pendingDueAt } : {}),
  };
}

export function profileDeletionImageCleanup(
  records: readonly AssociatedAdImageRecord[],
  ownsPath: (adId: string, path: string) => boolean,
  now: number,
): { jobs: ProfileDeletionImageCleanupJob[]; skippedCount: number } {
  const jobs: ProfileDeletionImageCleanupJob[] = [];
  let skippedCount = 0;
  for (const record of records) {
    const paths = recordImagePaths(record);
    const policy = profileDeletionCleanupPolicy({ activeReservations: Number(hasActiveReservation(paths.unlinkedReservations, now)), legacyImages: 0 }, now);
    for (const path of paths.all) {
      if (ownsPath(record.id, path)) jobs.push(cleanupJob(record.id, path, paths, policy));
      else if (ownsRawAdImagePath(record.id, path)) {
        profileDeletionCleanupPolicy({ activeReservations: 0, legacyImages: 1 }, now);
      }
      else skippedCount++;
    }
  }
  return { jobs, skippedCount };
}
