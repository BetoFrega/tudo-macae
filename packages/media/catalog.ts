import type { Media, MediaRevision } from "./model";
import type { LegacyMediaTransitionPlan } from "./transitionPolicy";
import { buildMediaCatalog } from "./lib/mediaCatalog";

export interface RegisterMediaInput {
  status: Media["status"];
  metadata: Pick<Media, "kind" | "alt" | "caption" | "provenance">;
  storagePath: string;
  mimeType: string;
}
export interface DemoMediaInput extends RegisterMediaInput { id: string }
export type MediaRecord = Omit<Media, "id">;
export interface MediaCatalogDependencies {
  now(): number;
  store: {
    create(record: MediaRecord): Promise<string>;
    ensure(id: string, record: MediaRecord): Promise<string>;
    read(id: string): Promise<Media | null>;
    revisions(id: string): Promise<MediaRevision[]>;
    transition(plans: LegacyMediaTransitionPlan[]): Promise<{ transitioned: number; alreadyCanonical: number }>;
  };
}
export function createMediaCatalog(dependencies: MediaCatalogDependencies) {
  return buildMediaCatalog(dependencies);
}
