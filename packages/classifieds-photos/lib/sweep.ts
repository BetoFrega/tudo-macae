import { PhotoError, PhotoPurgeError, photoLeaseMs, type PhotoDependencies, type PhotoOwner, type PhotoRecord } from "./contracts";
import { PhotoObjectUnavailable } from "./objectReservations";
import { changed, linked } from "./rules";

type Observe = PhotoDependencies["observe"];
type DeletionIntent = Awaited<ReturnType<PhotoDependencies["store"]["deletions"]>>[number];
type Tally = { completed: number; pending: number };

function claimBlocked(live: PhotoRecord, now: () => number) {
  return live.status === "retired" || live.retryAt > now() || (live.claimUntil ?? 0) > now() || (live.status === "reserved" && live.expiresAt > now());
}
function referencesPath(owner: PhotoOwner, path: string) {
  return owner.images.some(image => image.path === path) || owner.reservations.some(item => item.path === path);
}
function detachPath(owner: PhotoOwner, path: string): PhotoOwner {
  return { ...changed(owner), images: owner.images.filter(image => image.path !== path).map((image, order) => ({ ...image, order })), reservations: owner.reservations.filter(item => item.path !== path) };
}
function observeRetireFailure(observe: Observe, error: unknown, layer: "metadata" | "object" | "visibility", record: PhotoRecord) {
  if (!(error instanceof PhotoPurgeError)) {
    observe({ operation: "cleanup", outcome: "pending", cause: error instanceof PhotoObjectUnavailable ? `hosted_photo_${error.phase}` : error instanceof PhotoError ? error.code : "external_effect", layer, operationId: record.operationId });
    return;
  }
  for (const failure of error.failures) observe({ operation: "cleanup", outcome: "pending", ...failure, operationId: record.operationId });
}

export function buildPhotoSweep(d: PhotoDependencies, observe: Observe, retireUnlinked: (path: string) => Promise<unknown>) {
  async function deferDeletionIntents(deletions: DeletionIntent[]) {
    for (const intent of deletions) {
      try {
        await retireUnlinked(intent.path);
      }
      catch {
        observe({ operation: "cleanup", outcome: "failure", cause: "deletion_intent", operationId: intent.id });
      }
      await d.store.deferDeletion(intent.kind, intent.id, d.now() + photoLeaseMs);
    }
  }
  async function claim(candidate: PhotoRecord, token: string) {
    return d.store.transact(async (tx) => {
      const live = await tx.photo(candidate.path);
      if (!live || claimBlocked(live, () => d.now())) return null;
      const owner = await tx.owner(live.ownerKind, live.ownerId);
      if (live.status === "linked" || (live.status !== "reserved" && linked(owner, live))) return null;
      const value: PhotoRecord = { ...live, status: "retiring", claimToken: token, claimUntil: d.now() + photoLeaseMs, retryAt: d.now() + photoLeaseMs, attempts: live.attempts + 1, updatedAt: d.now() };
      tx.savePhoto(value);
      if (owner && referencesPath(owner, live.path)) tx.saveOwner(detachPath(owner, live.path));
      return value;
    });
  }
  async function markRetired(record: PhotoRecord, token: string) {
    return d.store.transact(async (tx) => {
      const live = await tx.photo(record.path);
      if (!live || live.claimToken !== token) return false;
      tx.savePhoto({ ...live, status: "retired", claimUntil: 0, updatedAt: d.now() });
      return true;
    });
  }
  async function releaseClaim(record: PhotoRecord, token: string) {
    try {
      await d.store.transact(async (tx) => {
        const live = await tx.photo(record.path);
        if (live?.claimToken === token) tx.savePhoto({ ...live, claimUntil: 0, retryAt: d.now() + Math.min(60_000 * live.attempts, photoLeaseMs), updatedAt: d.now() });
      });
    }
    catch { observe({ operation: "cleanup", outcome: "failure", cause: "claim_confirmation", layer: "metadata", operationId: record.operationId }); }
  }
  async function retire(record: PhotoRecord, token: string, tally: Tally) {
    let layer: "metadata" | "object" | "visibility" = "metadata";
    try {
      await d.purge.prepare(record);
      layer = "object";
      await d.objects.retire(record);
      layer = "visibility";
      const purge = await d.purge.verify(record);
      if (!purge.success) throw new PhotoPurgeError(purge.failures);
      layer = "metadata";
      const saved = await markRetired(record, token);
      if (saved) tally.completed++;
      observe({ operation: "cleanup", outcome: saved ? "success" : "pending", operationId: record.operationId });
    }
    catch (error) {
      tally.pending++;
      await releaseClaim(record, token);
      observeRetireFailure(observe, error, layer, record);
    }
  }
  async function sweepCandidate(candidate: PhotoRecord, tally: Tally) {
    const token = d.newId();
    let record: PhotoRecord | null = null;
    try {
      record = await claim(candidate, token);
    }
    catch {
      tally.pending++;
      observe({ operation: "cleanup", outcome: "failure", cause: "claim", layer: "metadata", operationId: candidate.operationId });
    }
    if (record) await retire(record, token, tally);
  }
  async function completeDeletionIntents(deletions: DeletionIntent[], tally: Tally) {
    for (const intent of deletions) {
      const record = await d.store.transact(tx => tx.photo(intent.path));
      if (record?.status === "retired") await d.store.completeDeletion(intent.kind, intent.id, intent.path);
      else tally.pending++;
    }
  }
  return async function sweep(limit = 25) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new PhotoError("invalid", "Lote de limpeza inválido.");
    const deletions = await d.store.deletions(d.now(), limit);
    await deferDeletionIntents(deletions);
    const candidates = await d.store.due(d.now(), limit);
    const tally: Tally = { completed: 0, pending: 0 };
    for (const candidate of candidates) await sweepCandidate(candidate, tally);
    await completeDeletionIntents(deletions, tally);
    return { attempted: candidates.length, completed: tally.completed, pending: tally.pending };
  };
}
