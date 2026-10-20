import { z } from "zod";

/** Operations any live administrator or editor reads; `unreferenced` is administrators' only. */
export const mediaReadOperations = ["search", "get", "byIds", "revisions", "unreferenced", "ingestion.get", "ingestion.search"] as const;
/** `update` is the administrators' metadata revision; `correct` the editors' audited correction. */
export const mediaWriteOperations = ["ingestion.prepare", "ingestion.finalize", "ingestion.reconcile", "correct", "update"] as const;
export type MediaReadOperation = typeof mediaReadOperations[number];
export type MediaWriteOperation = typeof mediaWriteOperations[number];
export const mediaReadInput = z.strictObject({ operation: z.enum(mediaReadOperations), input: z.json().default(null), requestId: z.string().min(1).max(128).optional() });
export const mediaWriteInput = z.strictObject({ operation: z.enum(mediaWriteOperations), input: z.json().default(null) });
export const mediaErrorSchema = z.object({
  name: z.enum(["MediaIngestionError", "MediaNotFoundError", "MediaRevisionConflictError", "ValidationError"]),
  code: z.string().optional(), details: z.record(z.string(), z.json()).default({}),
});
export type MediaErrorShape = z.infer<typeof mediaErrorSchema>;

/** The Worker path that receives an upload's bytes; the browser reaches it through the app's own upload route. */
export const mediaUploadPath = (reservationId: string) => `/api/media/uploads/${reservationId}`;
/** The Worker path of a Media's sanitized bytes for live administrators and editors. */
export const mediaContentPath = (mediaId: string) => `/api/media/content/${encodeURIComponent(mediaId)}`;
/** Set by the Worker on a Media 5xx it logged itself, so the app does not log the same failure again. */
export const mediaErrorReportedHeader = "x-media-error-reported";
/** The Worker path that answers which runtime owns editorial writes: `legacy` or `worker`. */
export const editorialAuthorityPath = "/api/editorial/authority";
