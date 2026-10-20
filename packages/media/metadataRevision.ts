import type { Media, MediaMetadata, MediaRevision } from "./model";
import { buildMediaMetadataRevision } from "./lib/mediaMetadataRevision";

export interface MediaRevisionTransaction {
  read(mediaId: string): Promise<Media | null>;
  archive(revision: MediaRevision): void;
  update(mediaId: string, patch: { metadata: MediaMetadata; revision: number; updatedAt: number }): void;
}
export type MediaRevisionResult
  = | { status: "updated"; media: Media }
    | { status: "not-found" }
    | { status: "conflict"; currentRevision: number };

export interface MediaMetadataRevisionDependencies {
  now(): number;
  store: {
    transact(decide: (transaction: MediaRevisionTransaction) => Promise<MediaRevisionResult>): Promise<MediaRevisionResult>;
  };
}
export function createMediaMetadataRevision(dependencies: MediaMetadataRevisionDependencies) {
  return buildMediaMetadataRevision(dependencies);
}
