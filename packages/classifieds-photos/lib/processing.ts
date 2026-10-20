import { PhotoError, photoByteLimit, type PhotoOwner, type PhotoRecord } from "./contracts";
import { matchesType } from "./reservation";

const retiredUpload = () => new PhotoError("retired", "Este envio não pode mais ser confirmado.");

/** Admission-only and profile reservations stay bound to the owner revision they reserved. */
function reservedRevisionMatches(owner: PhotoOwner, live: PhotoRecord) {
  if (!live.admissionOnly && live.ownerKind !== "profile") return true;
  return owner.revision === live.reservedRevision - (live.admissionOnly ? 1 : 0);
}

export function assertClaimable(owner: PhotoOwner, live: PhotoRecord | null | undefined, record: PhotoRecord, now: number): asserts live is PhotoRecord {
  if (!live || live.status !== "reserved" || live.expiresAt <= now || live.digest !== record.digest) throw retiredUpload();
  if (!reservedRevisionMatches(owner, live)) throw new PhotoError("conflict", "O conteúdo mudou. Releia antes de confirmar a foto.");
}

/** Decoded uploads are reused unless normalized bytes must be produced again; a live claim blocks concurrent producers. */
export function claimDecision(live: PhotoRecord, normalizes: boolean, recovered: boolean, now: number) {
  if (live.decodedAt !== undefined && (!normalizes || recovered)) return "reuse" as const;
  if ((live.claimUntil ?? 0) > now) throw new PhotoError("conflict", "Aguarde o processamento em andamento antes de tentar novamente.");
  return (live.processingAttempts ?? 0) >= 3 ? "exhausted" as const : "claim" as const;
}

export function assertClaimHeld(live: PhotoRecord | null | undefined, token: string, now: number): asserts live is PhotoRecord {
  if (!live || live.status !== "reserved" || live.expiresAt <= now || live.claimToken !== token || (live.claimUntil ?? 0) <= now) throw retiredUpload();
}

export function assertNormalized(normalized: { bytes: Uint8Array; mimeType: string }, record: PhotoRecord) {
  const size = normalized.bytes.byteLength;
  if (normalized.mimeType !== record.mimeType || size < 1 || size > photoByteLimit || !matchesType(normalized.bytes, normalized.mimeType)) throw new PhotoError("invalid", "A imagem processada deve manter o formato reservado e ter até 1MB.");
}
