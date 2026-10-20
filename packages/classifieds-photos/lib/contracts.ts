import { z } from "zod";
import { isPublicAdProfileId } from "@tudomacae/ads/publicDiscovery";

export const photoByteLimit = 1024 * 1024;
/** Bounds a delivered variant in memory. The provider re-encodes the original, so a variant may exceed `photoByteLimit`; lossy output at most 1920 px wide stays well under this. */
export const photoDeliveryByteLimit = 4 * 1024 * 1024;
export const photoLeaseMs = 20 * 60_000;
export const photoOwnerIdentifier = z.string().refine(isPublicAdProfileId, "Identificador inválido.");
export const photoRecordSchema = z.object({
  path: z.string(), id: z.string(), ownerKind: z.enum(["ad", "profile"]), ownerId: photoOwnerIdentifier,
  operationId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().nonnegative().max(photoByteLimit),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  status: z.enum(["reserved", "linked", "retiring", "retired"]),
  createdAt: z.number(), updatedAt: z.number(), expiresAt: z.number(), retryAt: z.number(), attempts: z.number().int().nonnegative(),
  pendingPublication: z.literal(true).optional(),
  sourceGeneration: z.string().optional(),
  processingAttempts: z.number().int().nonnegative().max(3).optional(), decodedAt: z.number().int().nonnegative().optional(),
  admissionOnly: z.literal(true).optional(),
  input: z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive().max(photoByteLimit), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]) }).optional(),
  reservedRevision: z.number().int().positive(), generation: z.string().optional(), claimToken: z.string().optional(), claimUntil: z.number().optional(),
  purgeSources: z.array(z.url()).max(2).optional(), purgeTag: z.string().optional(),
  title: z.string().max(500), description: z.string().max(5000),
});
export type PhotoRecord = z.infer<typeof photoRecordSchema>;
export type PhotoActor = { uid: string; admin: boolean };
export const photoUploadQuotaSchema = z.object({
  uploads: z.array(z.number().int().nonnegative()).max(1000),
  warning: z.object({ operationId: z.uuid(), createdAt: z.number().int().nonnegative() }).optional(),
});
export type PhotoUploadQuota = z.infer<typeof photoUploadQuotaSchema>;
export interface PhotoOwner {
  id: string; kind: "ad" | "profile"; userId?: string | undefined; revision: number; deleting?: boolean | undefined;
  publicationState?: string | undefined; photoPath?: string | undefined; images: { id: string; path: string; order: number; pending?: boolean | undefined; title?: string | undefined; description?: string | undefined }[];
  reservations: { path: string; expiresAt?: number | undefined }[];
}
export interface PhotoReader {
  owner(kind: "ad" | "profile", id: string): Promise<PhotoOwner | null>;
  photo(path: string): Promise<PhotoRecord | null>;
}
export interface PhotoTransaction extends PhotoReader {
  quota(accountId: string | null): Promise<PhotoUploadQuota>;
  saveQuota(accountId: string | null, quota: PhotoUploadQuota): void;
  savePhoto(record: PhotoRecord): void;
  saveOwner(owner: PhotoOwner): void;
}
export interface PhotoStore {
  /** Coherent metadata snapshot; retries perform no writes or external effects. */
  read<T>(decide: (reader: PhotoReader) => Promise<T>): Promise<T>;
  transact<T>(decide: (tx: PhotoTransaction) => Promise<T>): Promise<T>;
  due(now: number, limit: number): Promise<PhotoRecord[]>;
  deletions(now: number, limit: number): Promise<{ kind: "adCleanup" | "photoCleanup"; id: string; path: string }[]>;
  deferDeletion(kind: "adCleanup" | "photoCleanup", id: string, retryAt: number): Promise<void>;
  completeDeletion(kind: "adCleanup" | "photoCleanup", id: string, path: string): Promise<void>;
}
export interface PhotoObjects {
  create(record: PhotoRecord, bytes: Uint8Array): Promise<string>;
  head(record: PhotoRecord): Promise<boolean>;
  read(record: PhotoRecord): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  /** With `probe`, confirms the provider can emit the variant and returns empty bytes instead of downloading it. */
  deliver?: (record: PhotoRecord, delivery: PhotoDelivery, probe?: boolean) => Promise<{ bytes: Uint8Array; mimeType: string; delivered: true } | null>;
  retire(record: PhotoRecord): Promise<void>;
}
export interface PhotoDelivery {
  width: number;
  format: "avif" | "webp" | "jpeg";
}
export interface PhotoDependencies {
  store: PhotoStore; objects: PhotoObjects; now(): number; newId(): string; digest(bytes: Uint8Array): Promise<string>;
  decode(bytes: Uint8Array, maxPixels?: number): Promise<{ mimeType: string; width: number; height: number }>;
  normalizedMimeType?: "image/jpeg" | "image/webp";
  normalize?: (bytes: Uint8Array, maxPixels?: number, mimeType?: "image/jpeg" | "image/webp") => Promise<{ bytes: Uint8Array; mimeType: "image/jpeg" | "image/webp"; sourceMimeType: string; width: number; height: number }>;
  purge: { prepare(record: PhotoRecord): Promise<void>; verify(record: PhotoRecord): Promise<PhotoPurgeResult> };
  observe(event: { operation: "upload" | "cleanup" | "read"; outcome: "success" | "pending" | "failure"; cause?: string; layer?: "metadata" | "object" | "worker" | "resizing" | "visibility"; operationId: string }): void;
}
export type PhotoPurgeFailure = { layer: "metadata" | "worker" | "resizing" | "visibility"; cause: "configuration" | "authorization" | "rate_limit" | "provider" | "timeout" | "transport" | "verification" | "conflict" };
export type PhotoPurgeResult = { success: true } | { success: false; failures: PhotoPurgeFailure[] };
export class PhotoPurgeError extends Error {
  constructor(readonly failures: PhotoPurgeFailure[]) {
    super("Photo purge remains pending");
    this.name = "PhotoPurgeError";
  }
}
export class PhotoError extends Error {
  constructor(readonly code: "invalid" | "forbidden" | "conflict" | "retired" | "unavailable" | "rate_limit", message: string) {
    super(message);
    this.name = "PhotoError";
  }
}
export class PhotoUploadLimited extends PhotoError {
  constructor(readonly reason: "account_burst" | "account_daily" | "global_daily", readonly retryAfterMs: number) {
    super("rate_limit", `Aguarde ${Math.ceil(retryAfterMs / 60_000)} minuto(s) para enviar outra foto. Se precisar, entre em contato com o suporte.`);
  }
}
