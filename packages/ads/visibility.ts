import type { AdImage, AdStatus } from "./types";

export function hasCompletedPublication(record: { publicationState?: string }): boolean {
  return !record.publicationState || record.publicationState === "published";
}

export function hasPendingPublication(record: { publicationState?: unknown }): boolean {
  return typeof record.publicationState === "string" && ["pending", "publishing", "deleting"].includes(record.publicationState);
}

/** An Ad stored without status is paused. */
export function adStatus(record: { status?: AdStatus | "" | null }): AdStatus {
  return record.status || "paused";
}

export function canDiscoverAd(record: { publicationState?: string; status: string; deleting?: boolean }): boolean {
  return hasCompletedPublication(record) && record.status === "active" && !record.deleting;
}

export function visibleAdImages(images: unknown): AdImage[] {
  return Array.isArray(images) ? images.filter((image: AdImage) => image.pending !== true) : [];
}

/** Construction for the domain seam probe; callers import the functions directly. */
export function createAdVisibility() {
  return { adStatus, hasCompletedPublication, hasPendingPublication, canDiscoverAd, visibleAdImages };
}
