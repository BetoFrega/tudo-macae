interface EditorialListReadInput { requestId: string;
  limit?: number;
  cursor?: string; }

export interface Source {
  id: string;
  name: string;
  url?: string;
  canonicalUrl?: string;
  auxiliaryUrls: string[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface SourceRevision {
  sourceId: string;
  revision: number;
  name: string;
  url?: string;
  canonicalUrl?: string;
  auxiliaryUrls: string[];
  replacedByEditorId: string;
  replacedAt: number;
}

export type CaptureOrigin = "manual" | "assisted" | "automated" | "submitted";

export interface Capture {
  id: string;
  sourceId: string;
  fact: string;
  sourceUrl: string;
  reportedAt: number | null;
  accessedAt: number;
  quotedExcerpt?: string;
  origin: CaptureOrigin;
  editorId: string;
  editorialClientId?: string;
  editorialDelegationId?: string;
  createdAt: number;
}

export interface RegisterSourceInput {
  name: string;
  url?: string;
  idempotencyKey: string;
}

export type RegisterSourceResult
  = | {
    status: "created" | "reused" | "replayed";
    source: Source;
    correlationId: string;
  }
  | { status: "conflict";
    code: "idempotency_conflict"; };

export interface UpdateSourceInput {
  sourceId: string;
  name: string;
  url: string;
  auxiliaryUrls: string[];
  expectedRevision: number;
}

export type UpdateSourceResult
  = | { status: "updated";
    source: Source;
    correlationId: string; }
    | {
      status: "conflict";
      code: "revision_conflict";
      currentRevision: number;
      currentSource: Source;
    }
    | {
      status: "conflict";
      code: "canonical_url_conflict";
      existingSourceId: string;
    };

export interface RegisterCaptureInput {
  sourceId: string;
  fact: string;
  sourceUrl: string;
  reportedAt: number | null;
  accessedAt: number;
  quotedExcerpt?: string;
  idempotencyKey: string;
}

export type RegisterCaptureResult
  = | { status: "created";
    capture: Capture;
    correlationId: string; }
    | { status: "replayed";
      capture: Capture;
      correlationId: string; }
      | { status: "conflict";
        code: "idempotency_conflict"; };

export interface SourceListReadInput extends EditorialListReadInput {
  url?: string;
}

export interface SourceListReadPage {
  sources: Source[];
  requestId: string;
  nextCursor?: string;
}

export interface CaptureListReadInput extends EditorialListReadInput {
  sourceId?: string;
  reportedFrom?: number;
  reportedThrough?: number;
}

export interface CaptureListReadPage {
  captures: Capture[];
  requestId: string;
  nextCursor?: string;
}
