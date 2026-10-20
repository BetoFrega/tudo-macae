import { buildMediaUploadFinalization } from "./lib/mediaUploadFinalization";
import type { MediaUploadReservation } from "./uploadPreparation";
import type { Media, MediaMetadata } from "./model";
import type { FinalizedMediaUpload } from "./ingestionPolicy";

export type { MediaUploadReservation };
export type FinalizedMediaRecord = Omit<Media, "id">;
export interface MediaFinalizationTransaction {
  read(): Promise<MediaUploadReservation | null>;
  readCanonical(digest: string): Promise<{ id: string; metadata: MediaMetadata } | null>;
  update(fields: { status: "finalizing" | "finalized"; finalizationId?: string; result?: FinalizedMediaUpload }): void;
  createMedia(record: FinalizedMediaRecord, digest: string): string;
}
export interface MediaUploadFinalizationDependencies {
  now(): number;
  store: { transact<T>(id: string, decide: (transaction: MediaFinalizationTransaction) => Promise<T>): Promise<T> };
  readUpload(reservation: MediaUploadReservation): Promise<Uint8Array>;
  sanitize(bytes: Uint8Array): Promise<{ bytes: Uint8Array; digest: string }>;
  storeMedia(bytes: Uint8Array, digest: string): Promise<string>;
}
export function createMediaUploadFinalization(dependencies: MediaUploadFinalizationDependencies) {
  return buildMediaUploadFinalization(dependencies);
}
