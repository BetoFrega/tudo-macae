import type { MediaMetadata } from "./model";
import type { FinalizedMediaUpload } from "./ingestionPolicy";
import { buildMediaUploadQueries } from "./lib/mediaUploadQueries";

export interface MediaUploadQueryRecord {
  ownerId: string;
  metadata: MediaMetadata;
  finalizationId?: string | undefined;
  result?: FinalizedMediaUpload | undefined;
}
export interface MediaUploadQueryDependencies {
  read(reservationId: string): Promise<MediaUploadQueryRecord | null>;
}
export function createMediaUploadQueries(dependencies: MediaUploadQueryDependencies) {
  return buildMediaUploadQueries(dependencies);
}
