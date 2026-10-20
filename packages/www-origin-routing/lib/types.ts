/** `document` is an HTML page request; `other` is any remaining subresource or API call. */
export type RequestClass = "action" | "asset" | "document" | "other" | "rsc" | "editorial";

/** Failures the Worker itself produced or detected, beyond the application's status. */
export type RoutingFailure = "terms-worker-unavailable";

export interface WwwOriginLogEvent {
  failure?: RoutingFailure;
  outcome: "failure" | "success";
  requestClass: RequestClass;
  requestId?: string;
  termsWorkerVersion?: string;
  selectedOrigin?: "terms-workers";
  statusClass: string;
  /** `hit`: served from the Worker's colo cache; the others: that cache failed and the read went on uncached. */
  edgeCache?: "hit" | "read-failed" | "write-failed";
  /** A write whose outcome at the Web Worker is unknown: it may have run. */
  uncertainWrite?: true;
}

export interface WwwOriginRouterDependencies {
  fetchWebWorker(request: Request): Promise<Response>;
  /** Colo cache for `edgeCachedPaths`; absent, those reads always reach the Web Worker. */
  edgeCache?: EdgeCache;
  log(event: WwwOriginLogEvent): void;
}

/** The subset of the Workers Cache API the router uses. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Keeps the request alive for work finished after the response, such as a cache write. */
export interface BackgroundWork {
  waitUntil(promise: Promise<unknown>): void;
}
