import { createHash } from "node:crypto";
import type { Transaction } from "@tudomacae/classifieds-persistence";
import { StoredClassifiedsDataError } from "./classifiedsSupport";

/** Queues the individual cleanup job for one ad-owned photo path, once. */
export async function scheduleAdPhotoCleanup(tx: Transaction, adId: string, path: string, now: () => number) {
  const photo = await tx.read("retirement", path, "classifieds_photos");
  // Shared and unmanaged files have no owned lifecycle record and stay untouched.
  if (!photo || photo.body.ownerKind !== "ad" || photo.body.ownerId !== adId) return;
  const key = createHash("sha256").update(path).digest("hex");
  const job = await tx.read("adCleanup", key);
  if (job && (job.body.adId !== adId || job.body.path !== path)) throw new StoredClassifiedsDataError(new TypeError("Intenção de limpeza incoerente."));
  if (!job) tx.put({ kind: "adCleanup", id: key, body: { adId, path, status: "pending", dueAt: now(), writerCompleted: true } });
}
