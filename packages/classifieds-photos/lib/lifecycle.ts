import { PhotoError, PhotoUploadLimited, photoLeaseMs, type PhotoDependencies, type PhotoRecord, type PhotoOwner, type PhotoActor, type PhotoTransaction } from "./contracts";
import { createPhotoPathPolicy } from "../paths";
import { assertCanReserve, assertPublicationTarget, decodedWithinLimits, extensions, findPriorUpload, newReservation, parseUpload, reservedOwner, reusePrior, type PhotoUpload } from "./reservation";
import { admitPhotoUpload } from "./admission";
import { authorize, authorizeMutation, changed, hasLiveReservation, linked, queueRetirement } from "./rules";
import { buildPhotoSweep } from "./sweep";
import { assertClaimable, assertClaimHeld, assertNormalized, claimDecision } from "./processing";

export type { PhotoUpload } from "./reservation";
type Clock = () => number;

function alreadyConfirmed(owner: PhotoOwner, live: PhotoRecord, generation: string) {
  return live.status === "linked" && linked(owner, live) && live.generation === generation;
}
function stagePendingUpload(tx: PhotoTransaction, owner: PhotoOwner, live: PhotoRecord, generation: string, now: Clock) {
  if (owner.publicationState !== "pending" || !hasLiveReservation(owner, live.path, now)) throw new PhotoError("conflict", "Releia a publicação antes de salvar as fotos.");
  if (live.generation === generation) return live;
  const staged = { ...live, generation, updatedAt: now() };
  tx.savePhoto(staged);
  return staged;
}
function assertConfirmable(owner: PhotoOwner, record: PhotoRecord, live: PhotoRecord) {
  if (record.ownerKind === "profile" && owner.revision !== live.reservedRevision) throw new PhotoError("conflict", "O perfil mudou. Releia antes de confirmar a foto.");
  if (record.ownerKind === "ad" && !owner.images.some(image => image.id === record.id && image.path === record.path)) throw new PhotoError("retired", "A foto foi removida do anúncio.");
}
async function retireReplacedProfilePhoto(tx: PhotoTransaction, owner: PhotoOwner, record: PhotoRecord, now: Clock) {
  if (record.ownerKind !== "profile" || !owner.photoPath || owner.photoPath === record.path) return;
  const previous = await tx.photo(owner.photoPath);
  if (previous?.ownerKind === "profile" && previous.ownerId === owner.id && ["linked", "reserved"].includes(previous.status)) queueRetirement(tx, previous, now);
}
function linkUpload(tx: PhotoTransaction, owner: PhotoOwner, record: PhotoRecord, live: PhotoRecord, generation: string, now: Clock) {
  const result: PhotoRecord = { ...live, generation, status: "linked", updatedAt: now() };
  tx.savePhoto(result);
  tx.saveOwner({ ...changed(owner), ...(record.ownerKind === "profile" ? { photoPath: record.path } : {}),
    reservations: owner.reservations.filter(item => item.path !== record.path),
    images: owner.images.map(image => image.path === record.path ? { ...image, pending: false } : image) });
  return result;
}
function publiclyVisible(owner: PhotoOwner | null, record: PhotoRecord, path: string) {
  if (record.ownerKind !== "ad") return true;
  if (owner?.publicationState && owner.publicationState !== "published") return false;
  return !owner?.images.some(image => image.path === path && image.pending);
}
function assertPublishable(owner: PhotoOwner, now: Clock) {
  if (owner.reservations.some(item => (item.expiresAt ?? Infinity) > now())) throw new PhotoError("conflict", "Aguarde o envio das fotos antes de publicar.");
  if (owner.images.length > 3) throw new PhotoError("conflict", "O anúncio excede o limite de fotos.");
}
async function confirmedImage(tx: PhotoTransaction, image: PhotoOwner["images"][number], adId: string) {
  const record = await tx.photo(image.path);
  if (image.pending || record?.status !== "linked" || !record.generation || record.ownerKind !== "ad" || record.ownerId !== adId || record.id !== image.id) throw new PhotoError("conflict", "Uma foto ainda não foi confirmada.");
  return record;
}
export function buildPhotoLifecycle(d: PhotoDependencies) {
  const paths = createPhotoPathPolicy(d.digest);
  const now: Clock = () => d.now();
  function observe(event: Parameters<PhotoDependencies["observe"]>[0]) {
    try {
      d.observe(event);
    }
    catch { /* Telemetry cannot undo a durable transition. */ }
  }
  async function prepare(actor: PhotoActor, request: PhotoUpload): Promise<{ record: PhotoRecord; bytes?: Uint8Array }> {
    const value = parseUpload(actor, request);
    const file = { digest: await d.digest(request.bytes), size: request.bytes.byteLength };
    const normalizedMimeType = d.normalize ? d.normalizedMimeType ?? "image/webp" : undefined;
    const prefix = `${await paths.directory(value.ownerKind, value.ownerId)}${value.ownerKind === "ad" ? "pending/" : ""}${value.operationId}.`;
    const path = `${prefix}${extensions[normalizedMimeType ?? value.mimeType]}`;
    const reserved = await d.store.transact(async (tx) => {
      const owner = authorizeMutation(await tx.owner(value.ownerKind, value.ownerId), actor);
      assertPublicationTarget(value, owner);
      const prior = await findPriorUpload(tx, prefix, path, !!d.normalize);
      if (prior) {
        reusePrior(prior, owner, value, file, now);
        // Reservations made before durable admission enter it once, on their first retry.
        if (prior.status !== "reserved" || prior.processingAttempts !== undefined) return { record: prior, admitted: false, warning: false };
        const warning = await admitPhotoUpload(tx, actor.uid, value.operationId, d.now());
        const record = { ...prior, processingAttempts: 0 };
        tx.savePhoto(record);
        return { record, admitted: true, warning };
      }
      assertCanReserve(owner, value);
      const warning = await admitPhotoUpload(tx, actor.uid, value.operationId, d.now());
      const record = newReservation(value, owner, { path, ...file, normalizedMimeType }, d.now());
      tx.savePhoto(record);
      return { record, admitted: true, warning };
    }).catch((error) => {
      if (error instanceof PhotoUploadLimited) observe({ operation: "upload", outcome: "failure", cause: error.reason, operationId: value.operationId });
      throw error;
    });
    if (reserved.admitted) observe({ operation: "upload", outcome: "pending", cause: "admitted", operationId: value.operationId });
    if (reserved.warning) observe({ operation: "upload", outcome: "pending", cause: "global_warning", operationId: value.operationId });
    if (reserved.record.status === "linked") return { record: reserved.record };
    return verifyUpload(actor, reserved.record, request.bytes);
  }
  /** Claims one of three processing attempts so retries and concurrent producers never decode twice at once. */
  async function claimProcessing(actor: PhotoActor, record: PhotoRecord, token: string, normalizes: boolean, recovered: boolean) {
    return d.store.transact(async (tx) => {
      const owner = authorizeMutation(await tx.owner(record.ownerKind, record.ownerId), actor);
      const live = await tx.photo(record.path);
      assertClaimable(owner, live, record, d.now());
      const decision = claimDecision(live, normalizes, recovered, d.now());
      if (decision !== "claim") return { record: live, processing: false, exhausted: decision === "exhausted" };
      const value = { ...live, claimToken: token, claimUntil: d.now() + photoLeaseMs, processingAttempts: (live.processingAttempts ?? 0) + 1, updatedAt: d.now() };
      tx.savePhoto(value);
      return { record: value, processing: true, exhausted: false };
    });
  }
  async function processUpload(record: PhotoRecord, claimed: PhotoRecord, bytes: Uint8Array, normalize: PhotoDependencies["normalize"]) {
    const maxPixels = 16_000_000;
    const normalized = normalize ? await normalize(bytes, maxPixels, record.mimeType === "image/jpeg" ? "image/jpeg" : "image/webp") : undefined;
    const decoded = normalized ?? await d.decode(bytes, maxPixels);
    const original = claimed.input ?? claimed;
    const sourceMimeType = normalized ? normalized.sourceMimeType : decoded.mimeType;
    if (!decodedWithinLimits({ ...decoded, mimeType: sourceMimeType }, original.mimeType, maxPixels)) throw new PhotoError("invalid", "Escolha uma foto válida dentro dos limites do envio.");
    if (!normalized) return undefined;
    assertNormalized(normalized, record);
    return { bytes: normalized.bytes, canonical: { digest: await d.digest(normalized.bytes), size: normalized.bytes.byteLength, mimeType: normalized.mimeType } };
  }
  async function commitProcessing(actor: PhotoActor, record: PhotoRecord, token: string, canonical: { digest: string; size: number; mimeType: PhotoRecord["mimeType"] } | undefined) {
    return d.store.transact(async (tx) => {
      const owner = authorizeMutation(await tx.owner(record.ownerKind, record.ownerId), actor);
      const live = await tx.photo(record.path);
      assertClaimHeld(live, token, d.now());
      if (canonical && live.decodedAt !== undefined && canonical.digest !== live.digest) throw new PhotoError("conflict", "O processamento desta foto mudou. Selecione-a novamente para iniciar outro envio.");
      if (live.admissionOnly) {
        if (owner.revision !== live.reservedRevision - 1) throw new PhotoError("conflict", "O conteúdo mudou. Releia antes de confirmar a foto.");
        tx.saveOwner(reservedOwner(owner, live));
      }
      const value = { ...live, ...canonical, admissionOnly: undefined, decodedAt: d.now(), claimUntil: 0, updatedAt: d.now() };
      tx.savePhoto(value);
      return value;
    });
  }
  async function releaseClaim(record: PhotoRecord, token: string) {
    await d.store.transact(async (tx) => {
      const live = await tx.photo(record.path);
      if (live?.claimToken === token && live.claimUntil) tx.savePhoto({ ...live, claimUntil: 0, updatedAt: d.now() });
    });
  }
  async function verifyUpload(actor: PhotoActor, record: PhotoRecord, bytes: Uint8Array) {
    const normalize = record.input ? d.normalize : undefined;
    const recovered = normalize && record.decodedAt !== undefined ? await d.objects.read(record) : null;
    const token = d.newId();
    const claimed = await claimProcessing(actor, record, token, !!normalize, !!recovered);
    if (claimed.exhausted) {
      observe({ operation: "upload", outcome: "failure", cause: "processing_exhausted", operationId: record.operationId });
      throw new PhotoError("retired", "Este envio atingiu três tentativas de processamento. Selecione a foto novamente para iniciar outro envio.");
    }
    if (!claimed.processing) return { record: claimed.record, ...(recovered ? { bytes: recovered.bytes } : {}) };
    try {
      const processed = await processUpload(record, claimed.record, bytes, normalize);
      const result = await commitProcessing(actor, record, token, processed?.canonical);
      return { record: result, ...(processed ? { bytes: processed.bytes } : {}) };
    }
    catch (error) {
      await releaseClaim(record, token);
      throw error;
    }
  }
  async function reserve(actor: PhotoActor, input: PhotoUpload) {
    return (await prepare(actor, input)).record;
  }
  async function upload(actor: PhotoActor, input: PhotoUpload) {
    const prepared = await prepare(actor, input);
    const record = prepared.record;
    if (record.status === "linked") return record;
    const generation = await d.objects.create(record, prepared.bytes ?? input.bytes);
    return d.store.transact(async (tx) => {
      const owner = authorizeMutation(await tx.owner(record.ownerKind, record.ownerId), actor);
      const live = await tx.photo(record.path);
      if (live && alreadyConfirmed(owner, live, generation)) return live;
      if (!live || live.status !== "reserved" || live.expiresAt <= d.now()) throw new PhotoError("retired", "Este envio não pode mais ser confirmado.");
      if (record.pendingPublication) return stagePendingUpload(tx, owner, live, generation, now);
      assertConfirmable(owner, record, live);
      await retireReplacedProfilePhoto(tx, owner, record, now);
      return linkUpload(tx, owner, record, live, generation, now);
    }).then((result) => {
      observe({ operation: "upload", outcome: "success", operationId: record.operationId });
      return result;
    });
  }
  async function remove(actor: PhotoActor, path: string) {
    await d.store.transact(async (tx) => {
      const record = await tx.photo(path);
      if (!record) throw new PhotoError("invalid", "Foto não encontrada.");
      const owner = authorizeMutation(await tx.owner(record.ownerKind, record.ownerId), actor);
      if (record.status === "retired" || record.status === "retiring") return;
      queueRetirement(tx, record, now);
      tx.saveOwner({ ...changed(owner), ...(owner.photoPath === path ? { photoPath: undefined } : {}),
        images: owner.images.filter(image => image.path !== path).map((image, order) => ({ ...image, order })), reservations: owner.reservations.filter(item => item.path !== path) });
    });
    return { status: "scheduled" as const };
  }
  async function retireUnlinked(path: string) {
    return d.store.transact(async (tx) => {
      const record = await tx.photo(path);
      if (!record) return "unmanaged" as const;
      const owner = await tx.owner(record.ownerKind, record.ownerId);
      if (owner && record.status === "reserved" && record.expiresAt > d.now()) return "reserved" as const;
      if (linked(owner, record)) return "linked" as const;
      if (record.status !== "retired") queueRetirement(tx, record, now);
      return "scheduled" as const;
    });
  }
  async function readObject(record: PhotoRecord, head: boolean, delivery?: import("./contracts").PhotoDelivery) {
    // HEAD probes the variant too: only the provider knows whether it can emit this width and format, so HEAD never succeeds where GET would fail.
    if (delivery && d.objects.deliver) return d.objects.deliver(record, delivery, head);
    if (head) return await d.objects.head(record) ? { bytes: new Uint8Array(), mimeType: record.mimeType } : null;
    return d.objects.read(record);
  }
  async function read(path: string, actor?: PhotoActor, head = false, delivery?: import("./contracts").PhotoDelivery) {
    const authorized = () => d.store.read(async (tx) => {
      const record = await tx.photo(path);
      if (!record || record.status !== "linked" || !record.generation) return null;
      const owner = await tx.owner(record.ownerKind, record.ownerId);
      if (!linked(owner, record)) return null;
      if (!actor) return publiclyVisible(owner, record, path) ? record : null;
      authorize(owner, actor);
      return record;
    });
    const record = await authorized();
    if (!record) return null;
    const result = await readObject(record, head, delivery);
    if (!result) throw new PhotoError("unavailable", "A foto confirmada não pôde ser lida.");
    const current = await authorized();
    if (!current || current.generation !== record.generation || current.digest !== record.digest) return null;
    return result;
  }
  async function publication(actor: PhotoActor, adId: string) {
    const confirmed = () => d.store.transact(async (tx) => {
      const owner = authorize(await tx.owner("ad", adId), actor);
      assertPublishable(owner, now);
      const records: PhotoRecord[] = [];
      for (const image of owner.images) records.push(await confirmedImage(tx, image, adId));
      return { revision: owner.revision, images: owner.images, records };
    });
    const before = await confirmed();
    for (const record of before.records) {
      if (!await d.objects.head(record)) throw new PhotoError("unavailable", "Uma foto confirmada não está disponível.");
    }
    const after = await confirmed();
    if (after.revision !== before.revision || JSON.stringify(after.images) !== JSON.stringify(before.images) || after.records.some((record, index) => record.generation !== before.records[index]?.generation || record.digest !== before.records[index]?.digest)) throw new PhotoError("conflict", "As fotos mudaram. Releia antes de publicar.");
    return { revision: after.revision, images: after.images };
  }
  const sweep = buildPhotoSweep(d, observe, retireUnlinked);
  async function revoked(path: string) {
    return d.store.read(async (tx) => {
      const record = await tx.photo(path);
      return record?.status === "retiring" || record?.status === "retired";
    });
  }
  async function readAd(adId: string, imageId: string, actor?: PhotoActor, head = false, delivery?: import("./contracts").PhotoDelivery) {
    const path = await d.store.read(async (tx) => {
      const owner = await tx.owner("ad", adId);
      if (!owner || owner.deleting) return null;
      if (actor) authorize(owner, actor);
      return owner.images.find(image => image.id === imageId)?.path ?? null;
    });
    return path ? read(path, actor, head, delivery) : null;
  }
  return { reserve, upload, remove, read, readAd, retireUnlinked, sweep, publication, revoked };
}
