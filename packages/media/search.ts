import type { Media, MediaKind, MediaStatus } from "./model";
import { buildMediaSearch } from "./lib/mediaSearch";

export interface MediaSearchDependencies {
  scan(input: { limit: number; kind?: MediaKind; status?: MediaStatus; cursor?: { createdAt: number; id: string } }): Promise<Media[]>;
}
export function createMediaSearch(dependencies: MediaSearchDependencies) {
  return buildMediaSearch(dependencies);
}

export interface MediaReferenceLookup {
  hasReference(mediaId: string): Promise<boolean>;
}
export interface UnreferencedStagedMediaReportInput {
  limit?: number;
  cursor?: string;
}
export type { MediaSearchInput } from "./lib/mediaSearchPolicy";
