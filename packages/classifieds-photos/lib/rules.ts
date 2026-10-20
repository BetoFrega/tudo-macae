import { PhotoError, type PhotoActor, type PhotoOwner, type PhotoRecord, type PhotoTransaction } from "./contracts";

export function linked(owner: PhotoOwner | null, record: PhotoRecord) {
  return !!owner && !owner.deleting && (record.ownerKind === "profile" ? owner.photoPath === record.path : owner.images.some(image => image.path === record.path));
}
export function authorize(owner: PhotoOwner | null, actor: PhotoActor) {
  if (!owner || owner.deleting || (!actor.admin && owner.userId !== actor.uid)) throw new PhotoError("forbidden", "Foto não disponível nesta conta.");
  return owner;
}
export function authorizeMutation(owner: PhotoOwner | null, actor: PhotoActor) {
  const value = authorize(owner, actor);
  if (value.kind === "ad" && value.publicationState && !["pending", "published"].includes(value.publicationState)) throw new PhotoError("conflict", "Aguarde a publicação terminar antes de alterar as fotos.");
  return value;
}
export function changed(owner: PhotoOwner): PhotoOwner {
  return { ...owner, revision: owner.revision + 1 };
}
export function hasLiveReservation(owner: PhotoOwner, path: string, now: () => number) {
  return owner.reservations.some(reservation => reservation.path === path && (reservation.expiresAt ?? 0) > now());
}
export function queueRetirement(tx: PhotoTransaction, record: PhotoRecord, now: () => number) {
  tx.savePhoto({ ...record, status: "retiring", retryAt: now(), updatedAt: now() });
}
