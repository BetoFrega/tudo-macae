import { z } from "zod";
import { adImageUploadCleanupDelayMs } from "./imageUploadLease";
import type { PendingAdPublication } from "./client";

export class PendingPhotoConflict extends Error {
  constructor() {
    super("As fotos mudaram em outra sessão. Recarregue a página antes de salvar novamente.");
  }
}

export interface PendingPhoto {
  id: string;
  path: string;
  title?: string;
  description?: string;
  order: number;
}

export interface CompletedPhotoWriterProof {
  completedWriterPaths: readonly string[];
  completedAt: number;
  operationId: string;
}

export interface PendingPhotoDependencies {
  read(userId: string, id: string): Promise<PendingAdPublication | null>;
  pathFor(id: string, uploadId: string, mimeType: string): string;
  reserveUploads(id: string, userId: string, paths: string[], operationId: string, expiresAt: number): Promise<void>;
  enqueueCleanup(id: string, path: string, dueAt: number): Promise<void>;
  completeCleanup(path: string): Promise<void>;
  releaseUpload(id: string, userId: string, path: string, operationId: string): Promise<void>;
  upload(id: string, file: Uint8Array, mimeType: string, uploadId: string): Promise<{ path: string; created: boolean }>;
  replace(id: string, userId: string, updatedAt: number, operationId: string, build: (current: PendingPhoto[]) => PendingPhoto[]): Promise<{ images: PendingPhoto[]; cleanupPaths: string[] }>;
  scheduleCleanup(id: string, userId: string, paths: string[], proof?: CompletedPhotoWriterProof): Promise<void>;
  claimCleanup(id: string, userId: string, path: string): Promise<boolean>;
  remove(id: string, path: string): Promise<void>;
  acknowledgeCleanup(id: string, userId: string, path: string): Promise<void>;
  reportCleanupFailure?(operationId: string, cause: string, path?: string, requestFailed?: boolean, kind?: "upload" | "remove"): void;
  now(): number;
}

export function assertPendingPhotoMutation<T extends { userId?: string; publicationState?: string }>(record: T | undefined, userId: string): asserts record is T & { userId: string; publicationState: "pending" } {
  if (!record || record.userId !== userId || record.publicationState !== "pending") {
    throw new Error("Publicação pendente não encontrada nesta conta.");
  }
}

const imageInput = z.array(z.object({
  id: z.uuid(),
  title: z.string().max(140),
  description: z.string().max(300),
  order: z.number().int().min(0).max(2),
})).max(3);

type ImageInput = z.infer<typeof imageInput>[number];

interface SyncScope {
  id: string;
  userId: string;
  operationId: string;
}

interface UploadProgress {
  uploaded: Map<string, string>;
  createdPaths: string[];
}

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function parseImageList(formData: FormData, field: string, fallback: string) {
  const raw = formData.get(field);
  return imageInput.parse(JSON.parse(typeof raw === "string" ? raw : fallback));
}

function imageSnapshot(images: readonly Omit<PendingPhoto, "path">[]) {
  return JSON.stringify(images.map(image => ({
    id: image.id, title: image.title ?? "", description: image.description ?? "", order: image.order,
  })));
}

function observedImagesGuard(observed: readonly ImageInput[], desired: readonly ImageInput[]) {
  const observedSnapshot = imageSnapshot(observed);
  const desiredSnapshot = imageSnapshot(desired.map((image, order) => ({ ...image, order })));
  return (images: readonly PendingPhoto[]) => {
    const currentSnapshot = imageSnapshot(images);
    // An identical retry can acknowledge its committed result without changing newer metadata.
    if (currentSnapshot !== observedSnapshot && currentSnapshot !== desiredSnapshot) throw new PendingPhotoConflict();
  };
}

function validUploadFile(file: FormDataEntryValue | null): File {
  if (!(file instanceof File) || file.size > 1024 * 1024 || file.size === 0) {
    throw new Error("Escolha uma foto válida de até 1 MB para continuar.");
  }
  if (!allowedImageTypes.includes(file.type)) {
    throw new Error("Use uma foto JPEG, PNG, WebP ou GIF para continuar.");
  }
  return file;
}

export function createPendingPublicationImageSync(dependencies: PendingPhotoDependencies) {
  async function readPendingPublication(userId: string, id: string) {
    const publication = await dependencies.read(userId, id);
    if (!publication || publication.published || publication.deleting) throw new Error("Publicação pendente não encontrada nesta conta.");
    return publication;
  }

  function parseDesiredImages(formData: FormData) {
    const desired = parseImageList(formData, "images", "null");
    if (new Set(desired.map(image => image.id)).size !== desired.length) throw new Error("Fotos duplicadas.");
    return desired;
  }

  function collectNewFiles(scope: SyncScope, desired: readonly ImageInput[], currentIds: ReadonlySet<string>, formData: FormData) {
    const files = new Map<string, File>();
    const reservedPaths: string[] = [];
    for (const [index, image] of desired.entries()) {
      if (currentIds.has(image.id)) continue;
      const file = validUploadFile(formData.get(`file-${index}`));
      files.set(image.id, file);
      // An expired writer must never share a storage path with a later retry.
      reservedPaths.push(dependencies.pathFor(scope.id, `${image.id}-${scope.operationId}`, file.type));
    }
    return { files, reservedPaths };
  }

  async function reserveUploads(scope: SyncScope, reservedPaths: string[]) {
    for (const path of reservedPaths) await dependencies.enqueueCleanup(scope.id, path, dependencies.now() + adImageUploadCleanupDelayMs);
    if (reservedPaths.length) await dependencies.reserveUploads(scope.id, scope.userId, reservedPaths, scope.operationId, dependencies.now() + 5 * 60_000);
  }

  async function uploadFiles(scope: SyncScope, files: ReadonlyMap<string, File>, progress: UploadProgress) {
    for (const [imageId, file] of files) {
      const uploadId = `${imageId}-${scope.operationId}`;
      const { path, created } = await dependencies.upload(scope.id, new Uint8Array(await file.arrayBuffer()), file.type, uploadId);
      if (path !== dependencies.pathFor(scope.id, uploadId, file.type)) throw new Error("O envio da foto não corresponde à publicação.");
      progress.uploaded.set(imageId, path);
      if (created) progress.createdPaths.push(path);
    }
  }

  function replaceImages(scope: SyncScope, desired: readonly ImageInput[], uploaded: ReadonlyMap<string, string>, assertObservedImages: (images: readonly PendingPhoto[]) => void) {
    return dependencies.replace(scope.id, scope.userId, dependencies.now(), scope.operationId, (fresh) => {
      assertObservedImages(fresh);
      const known = new Map(fresh.map(image => [image.id, image]));
      return desired.map((image, order): PendingPhoto => {
        const path = uploaded.get(image.id) ?? known.get(image.id)?.path;
        if (!path) throw new Error("Esta foto mudou em outra sessão. Recarregue a página e tente novamente.");
        return { ...image, path, order };
      });
    });
  }

  async function releaseUploads(scope: SyncScope, paths: readonly string[], onError: (error: unknown, path: string) => void) {
    for (const path of paths) {
      try {
        await dependencies.releaseUpload(scope.id, scope.userId, path, scope.operationId);
      }
      catch (error) {
        onError(error, path);
      }
    }
  }

  async function removeUnlinkedUploads(scope: SyncScope, createdPaths: readonly string[]) {
    const fresh = await dependencies.read(scope.userId, scope.id);
    const linked = new Set(fresh?.images?.map(image => image.path) ?? []);
    for (const path of createdPaths) {
      try {
        if (!linked.has(path)) await dependencies.remove(scope.id, path);
        await dependencies.completeCleanup(path);
      }
      catch (cleanupError) {
        dependencies.reportCleanupFailure?.(scope.operationId, errorName(cleanupError), path, true);
      }
    }
  }

  async function rollbackCreatedUploads(scope: SyncScope, createdPaths: string[]) {
    try {
      await dependencies.scheduleCleanup(scope.id, scope.userId, createdPaths, {
        completedWriterPaths: createdPaths, completedAt: dependencies.now(), operationId: scope.operationId,
      });
    }
    catch { /* Upload jobs remain queued if terminal writer proof cannot be persisted. */ }
    await releaseUploads(scope, createdPaths, (releaseError, path) => {
      dependencies.reportCleanupFailure?.(scope.operationId, errorName(releaseError), path, true);
    });
    // Each operation owns a distinct storage path. A late write may finish
    // after the draft was deleted, so remove its unlinked object here.
    try {
      await removeUnlinkedUploads(scope, createdPaths);
    }
    catch (cleanupError) {
      for (const path of createdPaths) dependencies.reportCleanupFailure?.(scope.operationId, errorName(cleanupError), path, true);
    }
  }

  async function rollbackFailedSync(scope: SyncScope, reservedPaths: readonly string[], createdPaths: string[]) {
    if (createdPaths.length) await rollbackCreatedUploads(scope, createdPaths);
    for (const path of reservedPaths.filter(item => !createdPaths.includes(item))) dependencies.reportCleanupFailure?.(scope.operationId, "UploadUncertain", path, true);
  }

  async function settleReservations(scope: SyncScope, reservedPaths: readonly string[], images: readonly PendingPhoto[]) {
    const linkedPaths = new Set(images.map(image => image.path));
    for (const path of reservedPaths.filter(item => linkedPaths.has(item))) {
      try {
        await dependencies.completeCleanup(path);
      }
      catch (error) {
        dependencies.reportCleanupFailure?.(scope.operationId, errorName(error), path);
      }
    }
    await releaseUploads(scope, reservedPaths, (error, path) => {
      dependencies.reportCleanupFailure?.(scope.operationId, errorName(error), path);
    });
  }

  async function removeReplacedImages(scope: SyncScope, cleanupPaths: readonly string[]) {
    for (const path of cleanupPaths) {
      try {
        if (!await dependencies.claimCleanup(scope.id, scope.userId, path)) continue;
        await dependencies.remove(scope.id, path);
        await dependencies.acknowledgeCleanup(scope.id, scope.userId, path);
      }
      catch (error) {
        dependencies.reportCleanupFailure?.(scope.operationId, errorName(error), path, false, "remove");
      }
    }
  }

  return { sync: async (userId: string, id: string, formData: FormData, operationId: string = crypto.randomUUID()) => {
    const scope = { id, userId, operationId };
    const publication = await readPendingPublication(userId, id);
    const desired = parseDesiredImages(formData);
    const assertObservedImages = observedImagesGuard(parseImageList(formData, "observedImages", "[]"), desired);
    assertObservedImages(publication.images ?? []);
    const currentIds = new Set(publication.images?.map(image => image.id) ?? []);
    const { files, reservedPaths } = collectNewFiles(scope, desired, currentIds, formData);
    await reserveUploads(scope, reservedPaths);
    const progress: UploadProgress = { uploaded: new Map(), createdPaths: [] };
    let result: { images: PendingPhoto[]; cleanupPaths: string[] };
    try {
      await uploadFiles(scope, files, progress);
      result = await replaceImages(scope, desired, progress.uploaded, assertObservedImages);
    }
    catch (error) {
      await rollbackFailedSync(scope, reservedPaths, progress.createdPaths);
      throw error;
    }
    await settleReservations(scope, reservedPaths, result.images);
    await removeReplacedImages(scope, result.cleanupPaths);
    return result.images;
  } };
}
