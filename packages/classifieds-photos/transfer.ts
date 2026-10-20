import { z } from "zod";
import { PhotoError, photoByteLimit, photoRecordSchema, type PhotoDependencies, type PhotoOwner, type PhotoRecord } from "./lib/contracts";
import { createPhotoPathPolicy } from "./paths";

export const photoInventorySchema = photoRecordSchema.pick({ path: true, id: true, ownerKind: true, ownerId: true, operationId: true, digest: true, size: true, mimeType: true, title: true, description: true }).extend({
  sourceGeneration: z.string().min(1), expectedRevision: z.number().int().positive(),
});
export type PhotoInventory = z.infer<typeof photoInventorySchema>;
export const photoTransferFailureReasons = ["invalid_inventory", "source_diverged", "reference_diverged", "destination_diverged", "destination_missing", "destination_bytes_diverged", "destination_changed"] as const;
export class PhotoTransferError extends PhotoError {
  constructor(readonly reason: typeof photoTransferFailureReasons[number], message: string) {
    super(reason === "invalid_inventory" ? "invalid" : "conflict", message);
  }
}
function matchesInventory(record: PhotoRecord, item: PhotoInventory) {
  return record.status === "linked" && record.reservedRevision === item.expectedRevision
    && (["path", "id", "ownerKind", "ownerId", "operationId", "digest", "size", "mimeType", "title", "description", "sourceGeneration"] as const).every(field => record[field] === item[field]);
}
function referencesItem(owner: PhotoOwner | null, item: PhotoInventory) {
  return !!owner && !owner.deleting && owner.revision === item.expectedRevision
    && (item.ownerKind === "profile" ? owner.photoPath === item.path : owner.images.some(image => image.path === item.path && image.id === item.id && !image.pending));
}
export function createPhotoTransfer(d: Pick<PhotoDependencies, "store" | "objects" | "digest" | "now"> & {
  source(item: PhotoInventory): Promise<{ bytes: Uint8Array; generation: string; mimeType: string }>;
}) {
  async function matchesBytes(file: { bytes: Uint8Array; mimeType: string } | null, item: PhotoInventory) {
    if (!file || file.mimeType !== item.mimeType || file.bytes.byteLength !== item.size) return false;
    return await d.digest(file.bytes) === item.digest;
  }
  async function assertOwnedItem(item: PhotoInventory) {
    if (!await createPhotoPathPolicy(d.digest).owns(item) || item.size < 1 || item.size > photoByteLimit) throw new PhotoTransferError("invalid_inventory", "Arquivo fora do inventário próprio.");
  }
  async function readSource(item: PhotoInventory) {
    const source = await d.source(item);
    if (source.generation !== item.sourceGeneration || !await matchesBytes(source, item)) throw new PhotoTransferError("source_diverged", "O arquivo de origem divergiu do inventário.");
    return source;
  }
  async function reference(item: PhotoInventory) {
    return d.store.read(async (tx) => {
      if (!referencesItem(await tx.owner(item.ownerKind, item.ownerId), item)) throw new PhotoTransferError("reference_diverged", "A referência divergiu do inventário.");
      const prior = await tx.photo(item.path);
      if (prior && !matchesInventory(prior, item)) throw new PhotoTransferError("destination_diverged", "O destino divergiu do inventário.");
      return prior;
    });
  }
  async function copy(item: PhotoInventory, bytes: Uint8Array) {
    const now = d.now();
    const record = { ...item, status: "linked" as const, reservedRevision: item.expectedRevision, createdAt: now, updatedAt: now, expiresAt: now, retryAt: now, attempts: 0 };
    const generation = await d.objects.create(record, bytes);
    if (!await matchesBytes(await d.objects.read({ ...record, generation }), item)) throw new PhotoTransferError("destination_bytes_diverged", "Os bytes no destino divergiram.");
    await reference(item);
    const unchanged = await d.store.transact(async (tx) => {
      const owner = await tx.owner(item.ownerKind, item.ownerId);
      const existing = await tx.photo(item.path);
      if (!referencesItem(owner, item) || (existing && !matchesInventory(existing, item))) throw new PhotoTransferError("destination_changed", "O destino mudou durante a transferência.");
      if (!existing) tx.savePhoto({ ...record, generation });
      return existing !== null;
    });
    return unchanged ? "unchanged" as const : "imported" as const;
  }
  return {
    async importItem(input: unknown, dryRun: boolean, compare = false) {
      const item = photoInventorySchema.parse(input);
      await assertOwnedItem(item);
      const source = await readSource(item);
      const prior = await reference(item);
      if (compare && !prior) throw new PhotoTransferError("destination_missing", "A foto está ausente do destino.");
      if (prior && (compare || !dryRun) && !await matchesBytes(await d.objects.read(prior), item)) throw new PhotoTransferError("destination_bytes_diverged", "O destino divergiu do inventário.");
      const summary = { path: item.path, digest: item.digest, sourceGeneration: item.sourceGeneration };
      if (dryRun) return { status: "verified" as const, ...summary };
      if (prior) {
        await reference(item);
        return { status: "unchanged" as const, ...summary };
      }
      return { status: await copy(item, source.bytes), ...summary };
    },
  };
}
