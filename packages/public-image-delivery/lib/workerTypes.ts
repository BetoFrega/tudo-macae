import type { PublicImageClass, PublicImagePreset } from "../contract";

export interface PublicImageWorkerConfiguration {
  publicHost: string;
  /** Ad and Profile photos are delivered only from this Classifieds Worker origin; without it they fail as `configuration`. */
  classifiedsOrigin?: string | undefined;
  editorialOrigin?: string | undefined;
  editorialCacheProbeSecret?: string | undefined;
}

export interface PublicImageTransformOptions {
  preserveAnimation: false;
  resize: "scale-down";
  format: "avif" | "jpeg" | "webp";
  stripMetadata: true;
  quality: 75;
  width: number;
}

export type PublicImageTransform = (
  origin: string,
  options: PublicImageTransformOptions,
) => Promise<{ response: Response; failure: "origin" | "transformation" }>;

export interface PublicImageCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface PublicImageDeliveryLogEvent {
  cache: "hit" | "miss" | "uninspected";
  failure?: "origin" | "transformation" | "configuration" | "cache" | undefined;
  imageClass: PublicImageClass;
  preset: PublicImagePreset;
  reason?: "cache_probe_authorization";
  result: "fallback" | "gone" | "not_found" | "rejected" | "transformed" | "cache_present" | "cache_absent" | "cache_write_failed";
  status: number;
}

export interface InvalidPublicImageRequestLogEvent {
  cache: "uninspected";
  reason: "invalid_public_image_request";
  result: "rejected";
  routeTemplate: "/v1/:class/:preset/:width/:key" | "/v1/remaining/:class/:preset/:width/:key";
  status: 400;
}

export type PublicImageLogEvent = PublicImageDeliveryLogEvent | InvalidPublicImageRequestLogEvent;
export type PublicImageRouteTemplate = InvalidPublicImageRequestLogEvent["routeTemplate"];

export interface PublicImageWorkerDependencies {
  cache: PublicImageCache;
  transform: PublicImageTransform;
  fetchOriginal(origin: string): Promise<Response>;
  checkOrigin(input: string): Promise<Response>;
  log(event: PublicImageLogEvent): void;
}

export type Defer = (promise: Promise<unknown>) => void;

export interface ParsedImageRequest {
  remaining: boolean;
  imageClass: PublicImageClass;
  preset: PublicImagePreset;
  width: number;
  key: string;
  format: "avif" | "jpeg" | "webp";
}
