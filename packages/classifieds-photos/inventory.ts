import { z } from "zod";
import { photoByteLimit } from "./index";
import { createPhotoPathPolicy } from "./paths";
import { photoInventorySchema, type PhotoInventory } from "./transfer";

export const photoInventoryObjectSchema = z.object({
  path: z.string().min(1), generation: z.string().min(1), size: z.number().int().nonnegative(), mimeType: z.string(), file: z.string().min(1),
});
export type PhotoInventoryObject = z.infer<typeof photoInventoryObjectSchema>;
export const photoInventoryOwnerSchema = z.object({ kind: z.enum(["ad", "profile"]), id: z.string().min(1), sourceVersion: z.string().min(1), body: z.looseObject({
  revision: z.number().int().positive().default(1), deleting: z.boolean().optional(), advertiserProfileId: z.string().optional(), photoPath: z.string().optional(),
  images: z.array(z.object({ id: z.string().default(""), path: z.string(), pending: z.boolean().optional(), title: z.string().default(""), description: z.string().default("") })).default([]),
  pendingImageUploadReservations: z.array(z.object({ path: z.string() })).default([]), pendingImageCleanupPaths: z.array(z.string()).default([]), pendingImageCleanupClaims: z.array(z.string()).default([]),
}) });
export type PhotoInventoryOwner = z.input<typeof photoInventoryOwnerSchema>;
type Reference = { path: string;
  id?: string;
  ownerKind: "ad" | "profile";
  ownerId: string;
  expectedRevision: number;
  sourceVersion: string;
  advertiserProfileId?: string | undefined;
  title: string;
  description: string;
  pending: boolean;
  deleting: boolean; };
export type PhotoInventoryAccounting = { path: string;
  ownerKind?: "ad" | "profile";
  ownerId?: string;
  sourceVersion?: string;
  disposition: "selected" | "retired" | "unreferenced" | "outside_scope" | "blocked";
  cause?: "cleanup_unresolved" | "upload_pending" | "missing_object" | "duplicate_reference" | "unmanaged_reference" | "owner_deleting" | "profile_missing" | "unsupported_object" | "invalid_reference" | "source_diverged"; };

/** Select existing references; accounting never authorizes deleting omitted objects. */
export type PhotoInventoryInput = {
  owners: readonly PhotoInventoryOwner[];
  objects: readonly PhotoInventoryObject[];
  retiredPaths: readonly string[];
  cleanupPaths: readonly string[];
};
export type PhotoInventoryDependencies = {
  /** Operation ID of a selected object; `sourcePhotoOperationId` keeps it stable across exports of an unchanged source. */
  newId(object: PhotoInventoryObject): string | Promise<string>;
  digest(bytes: Uint8Array): Promise<string>;
  read(object: PhotoInventoryObject): Promise<{ bytes: Uint8Array;
    generation: string;
    mimeType: string; }>;
  save(item: PhotoInventory, bytes: Uint8Array): Promise<void>;
};
/**
 * A legacy cleanup job is unresolved until its sweeper completes it (ad jobs are deleted, profile jobs keep
 * `status: "completed"`). D1 never receives the Firebase object or its lifecycle row, so an unresolved job
 * imported with the records would stay deferred forever while the legacy object survives.
 */
export function unresolvedCleanup(body: { status?: unknown }) {
  return !["completed", "success"].includes(String(body.status ?? "pending"));
}
type Owner = z.infer<typeof photoInventoryOwnerSchema>;
type Cause = NonNullable<PhotoInventoryAccounting["cause"]>;
type Disposition = { disposition: PhotoInventoryAccounting["disposition"]; cause?: Cause };
type Selection = {
  profiles: Map<string, Owner>;
  objects: Map<string, PhotoInventoryObject>;
  frequencies: Map<string, number>;
  retired: Set<string>;
  cleanup: Set<string>;
  pending: Set<string>;
  owns(reference: Reference): Promise<boolean>;
};
const blocked = (cause: Cause): Disposition => ({ disposition: "blocked", cause });
const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function parseOwners(values: readonly PhotoInventoryOwner[]) {
  const owners = values.map(owner => photoInventoryOwnerSchema.parse(owner));
  const keys = new Set<string>();
  for (const owner of owners) {
    const key = `${owner.kind}:${owner.id}`;
    if (keys.has(key)) throw new Error("DuplicateInventoryOwner");
    keys.add(key);
  }
  return owners;
}

function parseObjects(values: readonly PhotoInventoryObject[]) {
  const objects = new Map<string, PhotoInventoryObject>();
  for (const value of values) {
    const object = photoInventoryObjectSchema.parse(value);
    if (objects.has(object.path)) throw new Error("DuplicateInventoryObject");
    objects.set(object.path, object);
  }
  return objects;
}

/** Collects every owner reference, adding owner-held pending and cleanup paths to the given sets. */
function collectReferences(owners: readonly Owner[], pending: Set<string>, cleanup: Set<string>) {
  const references: Reference[] = [];
  for (const owner of owners) {
    for (const reservation of owner.body.pendingImageUploadReservations) pending.add(reservation.path);
    for (const path of [...owner.body.pendingImageCleanupPaths, ...owner.body.pendingImageCleanupClaims]) cleanup.add(path);
    const common = { ownerKind: owner.kind, ownerId: owner.id, expectedRevision: owner.body.revision, sourceVersion: owner.sourceVersion, advertiserProfileId: owner.body.advertiserProfileId, deleting: owner.body.deleting ?? false };
    if (owner.kind === "profile" && owner.body.photoPath) references.push({ ...common, path: owner.body.photoPath, title: "", description: "", pending: false });
    if (owner.kind === "ad") references.push(...adReferences(owner, common, pending));
  }
  return references;
}

function adReferences(owner: Owner, common: Omit<Reference, "path" | "title" | "description" | "pending">, pending: Set<string>): Reference[] {
  return owner.body.images.map((image) => {
    if (image.pending) pending.add(image.path);
    return { ...common, ...image, pending: image.pending ?? false };
  });
}

function profileBlock(reference: Reference, profiles: Map<string, Owner>) {
  const profileId = reference.advertiserProfileId;
  if (reference.ownerKind !== "ad" || !profileId) return undefined;
  const profile = profiles.get(profileId);
  if (!profile) return blocked("profile_missing");
  return profile.body.deleting ? blocked("owner_deleting") : undefined;
}

async function ownershipBlock(reference: Reference, selection: Selection) {
  if (selection.frequencies.get(reference.path)! > 1) return blocked("duplicate_reference");
  if (!await selection.owns(reference)) return blocked("unmanaged_reference");
  if (reference.deleting) return blocked("owner_deleting");
  return profileBlock(reference, selection.profiles);
}

/**
 * An unfinished upload (pending image or reservation) blocks: D1 rejects publishing a draft with a pending image
 * and cannot settle a reservation without its lifecycle row, so importing the owner would strand the draft.
 */
function stateDisposition(reference: Reference, selection: Selection): Disposition | undefined {
  if (selection.cleanup.has(reference.path)) return blocked("cleanup_unresolved");
  if (selection.retired.has(reference.path)) return { disposition: "retired" };
  if (reference.pending || selection.pending.has(reference.path)) return blocked("upload_pending");
  return undefined;
}

function objectBlock(object: PhotoInventoryObject | undefined) {
  if (!object) return blocked("missing_object");
  if (object.size < 1 || object.size > photoByteLimit || !supportedTypes.includes(object.mimeType)) return blocked("unsupported_object");
  return undefined;
}

function unreferencedDisposition(path: string, selection: Selection): Disposition {
  if (selection.cleanup.has(path)) return blocked("cleanup_unresolved");
  if (selection.retired.has(path)) return { disposition: "retired" };
  if (selection.pending.has(path)) return blocked("upload_pending");
  return { disposition: /^(ad-images|profile-photos)\//.test(path) ? "unreferenced" : "outside_scope" };
}

/**
 * Derives the operation ID from the source object's path and generation, so a repeated export of an unchanged
 * source resumes the Hosted reservations and linked rows of an earlier partial transfer instead of diverging
 * from them. A new generation yields a new ID, which the destination rejects as `destination_diverged`.
 */
export async function sourcePhotoOperationId(object: Pick<PhotoInventoryObject, "path" | "generation">, digest: PhotoInventoryDependencies["digest"]) {
  const hex = await digest(new TextEncoder().encode(JSON.stringify(["classifieds-photo-operation", object.path, object.generation])));
  // RFC 9562 version 8 (custom) layout over the SHA-256 prefix.
  const variant = (8 | (Number.parseInt(hex[16]!, 16) & 3)).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createPhotoInventory(dependencies: PhotoInventoryDependencies) {
  async function select(reference: Reference, object: PhotoInventoryObject, operations: Set<string>): Promise<Disposition> {
    const source = await dependencies.read(object);
    if (source.bytes.byteLength !== object.size || source.generation !== object.generation || source.mimeType !== object.mimeType) return blocked("source_diverged");
    const operationId = await dependencies.newId(object);
    if (operations.has(operationId)) throw new Error("DuplicateInventoryOperation");
    operations.add(operationId);
    const result = photoInventorySchema.safeParse({ ...reference, id: reference.id ?? operationId, operationId, sourceGeneration: object.generation, size: source.bytes.byteLength, mimeType: source.mimeType, digest: await dependencies.digest(source.bytes) });
    if (!result.success) return blocked("invalid_reference");
    await dependencies.save(result.data, source.bytes);
    return { disposition: "selected" };
  }
  async function classify(reference: Reference, selection: Selection, operations: Set<string>) {
    const object = selection.objects.get(reference.path);
    return await ownershipBlock(reference, selection)
      ?? stateDisposition(reference, selection)
      ?? objectBlock(object)
      ?? await select(reference, object!, operations);
  }
  return { async generate(input: PhotoInventoryInput) {
    const owners = parseOwners(input.owners);
    const objects = parseObjects(input.objects);
    const pending = new Set<string>();
    const cleanup = new Set(input.cleanupPaths);
    const references = collectReferences(owners, pending, cleanup);
    const frequencies = new Map<string, number>();
    for (const reference of references) frequencies.set(reference.path, (frequencies.get(reference.path) ?? 0) + 1);
    const paths = createPhotoPathPolicy(dependencies.digest);
    const selection: Selection = {
      profiles: new Map(owners.filter(owner => owner.kind === "profile").map(owner => [owner.id, owner])),
      objects, frequencies, retired: new Set(input.retiredPaths), cleanup, pending, owns: reference => paths.owns(reference),
    };
    const operations = new Set<string>();
    const accounting: PhotoInventoryAccounting[] = [];
    for (const reference of references) {
      const { path, ownerKind, ownerId, sourceVersion } = reference;
      accounting.push({ path, ownerKind, ownerId, sourceVersion, ...await classify(reference, selection, operations) });
    }
    for (const path of new Set([...objects.keys(), ...pending, ...selection.retired, ...cleanup])) {
      if (!frequencies.has(path)) accounting.push({ path, ...unreferencedDisposition(path, selection) });
    }
    const selected = accounting.filter(row => row.disposition === "selected").length;
    return { selected, blocked: accounting.filter(row => row.disposition === "blocked").length, owners: owners.length, objects: objects.size, references: references.length, accounting };
  } };
}
