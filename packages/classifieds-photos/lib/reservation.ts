import { z } from "zod";
import { PhotoError, photoByteLimit, photoLeaseMs, photoOwnerIdentifier, type PhotoActor, type PhotoOwner, type PhotoRecord, type PhotoTransaction } from "./contracts";
import { changed, hasLiveReservation, linked } from "./rules";

const inputSchema = z.object({ ownerKind: z.enum(["ad", "profile"]), ownerId: photoOwnerIdentifier,
  operationId: z.uuid(), expectedRevision: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  pendingPublication: z.literal(true).optional(),
  title: z.string().max(500).default(""), description: z.string().max(5000).default(""),
});
export type PhotoUpload = z.input<typeof inputSchema> & { bytes: Uint8Array };
export type PhotoUploadInput = z.output<typeof inputSchema>;
export const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;

export function matchesType(bytes: Uint8Array, mimeType: string) {
  const prefix = String.fromCharCode(...bytes.slice(0, 12));
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === "image/webp") return prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP";
  return prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a");
}
function acceptableBytes(bytes: Uint8Array, mimeType: string) {
  return bytes.byteLength >= 1 && bytes.byteLength <= photoByteLimit && matchesType(bytes, mimeType);
}
export function parseUpload(actor: PhotoActor, request: PhotoUpload): PhotoUploadInput {
  const input = inputSchema.safeParse(request);
  if (!input.success || !actor.uid || !acceptableBytes(request.bytes, input.data.mimeType)) throw new PhotoError("invalid", "Escolha uma foto válida de até 1MB.");
  return input.data;
}
export function decodedWithinLimits(decoded: { mimeType: string; width: number; height: number }, mimeType: string, maxPixels: number | undefined) {
  if (decoded.mimeType !== mimeType) return false;
  if (!Number.isInteger(decoded.width) || !Number.isInteger(decoded.height) || decoded.width < 1 || decoded.height < 1) return false;
  return maxPixels === undefined || decoded.width * decoded.height <= maxPixels;
}
export function assertPublicationTarget(value: PhotoUploadInput, owner: PhotoOwner) {
  if (value.pendingPublication && (owner.kind !== "ad" || owner.publicationState !== "pending")) throw new PhotoError("conflict", "Releia a publicação antes de salvar as fotos.");
}
/**
 * Finds the earlier record of this operation under any extension. Without normalization the
 * reserved path is fixed by the upload MIME type, so a sibling extension is another photo.
 */
export async function findPriorUpload(tx: PhotoTransaction, prefix: string, path: string, normalizes: boolean) {
  let prior: PhotoRecord | null = null;
  for (const extension of Object.values(extensions)) {
    const candidate = await tx.photo(`${prefix}${extension}`);
    if (!candidate) continue;
    if (prior || (!normalizes && candidate.path !== path)) throw new PhotoError("conflict", "Este envio já identifica outra foto.");
    prior = candidate;
  }
  return prior;
}
function sameUpload(prior: PhotoRecord, value: PhotoUploadInput, file: { digest: string; size: number }) {
  const original = prior.input ?? prior;
  return original.digest === file.digest && original.size === file.size && original.mimeType === value.mimeType
    && prior.title === value.title && prior.description === value.description
    && prior.pendingPublication === value.pendingPublication && (value.pendingPublication || prior.reservedRevision === value.expectedRevision + 1);
}
function expired(prior: PhotoRecord, now: () => number) {
  return prior.status === "retiring" || prior.status === "retired" || (prior.status === "reserved" && prior.expiresAt <= now());
}
/** A retried upload returns its earlier record only while that record still stands for the same, live upload. */
export function reusePrior(prior: PhotoRecord, owner: PhotoOwner, value: PhotoUploadInput, file: { digest: string; size: number }, now: () => number) {
  if (!sameUpload(prior, value, file)) throw new PhotoError("conflict", "Este envio já identifica outra foto.");
  if (expired(prior, now)) throw new PhotoError("retired", "Esta foto foi removida ou o envio expirou. Selecione-a novamente.");
  if (prior.pendingPublication && !prior.admissionOnly && prior.status === "reserved" && !hasLiveReservation(owner, prior.path, now)) throw new PhotoError("retired", "Este envio não pode mais ser confirmado.");
  if (prior.status === "linked" && !linked(owner, prior)) throw new PhotoError("retired", "A foto já não pertence ao conteúdo.");
  return prior;
}
export function assertCanReserve(owner: PhotoOwner, value: PhotoUploadInput) {
  if (owner.revision !== value.expectedRevision) throw new PhotoError("conflict", "O conteúdo mudou. Releia antes de enviar a foto.");
  if (value.ownerKind === "ad" && !value.pendingPublication && owner.images.length >= 3) throw new PhotoError("invalid", "Cada anúncio pode ter até três fotos.");
  if (owner.reservations.length >= 16) throw new PhotoError("unavailable", "Aguarde os envios em andamento terminarem.");
}
/**
 * An admission-only reservation consumes upload capacity before any image processing; the owner
 * receives the reservation only after the bytes are verified.
 */
export function newReservation(value: PhotoUploadInput, owner: PhotoOwner, file: { path: string; digest: string; size: number; normalizedMimeType?: "image/jpeg" | "image/webp" | undefined }, now: number): PhotoRecord {
  const normalized = file.normalizedMimeType ? { input: { digest: file.digest, size: file.size, mimeType: value.mimeType }, mimeType: file.normalizedMimeType } : {};
  return { ...value, path: file.path, id: value.operationId, digest: file.digest, size: file.size, ...normalized,
    status: "reserved", createdAt: now, updatedAt: now, expiresAt: now + photoLeaseMs, retryAt: now + photoLeaseMs, attempts: 0, processingAttempts: 0, admissionOnly: true, reservedRevision: owner.revision + 1 };
}
export function reservedOwner(owner: PhotoOwner, record: PhotoRecord): PhotoOwner {
  const listsImage = record.ownerKind === "ad" && !record.pendingPublication;
  return { ...changed(owner), reservations: [...owner.reservations, { path: record.path, expiresAt: record.expiresAt }],
    images: listsImage ? [...owner.images.map((image, order) => ({ ...image, order })), { id: record.id, path: record.path, order: owner.images.length, pending: true, title: record.title, description: record.description }] : owner.images };
}
