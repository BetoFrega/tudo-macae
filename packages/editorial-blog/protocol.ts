import { z } from "zod";

export const blogReadOperations = ["list", "get"] as const;
export const blogWriteOperations = ["save", "takeOffline"] as const;
export type BlogReadOperation = typeof blogReadOperations[number];
export type BlogWriteOperation = typeof blogWriteOperations[number];
export const blogReadInput = z.strictObject({ operation: z.enum(blogReadOperations), input: z.json().default(null) });
export const blogWriteInput = z.strictObject({ operation: z.enum(blogWriteOperations), input: z.json().default(null), correlationId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional() });
/** A `BlogError` keeps its code; `ValidationError` is invalid input. Both carry the field the editor corrects. */
export const blogErrorSchema = z.object({
  name: z.enum(["BlogError", "ValidationError"]),
  code: z.enum(["forbidden", "notFound", "conflict", "media"]).optional(),
  field: z.string().max(64).optional(),
});
export type BlogErrorShape = z.infer<typeof blogErrorSchema>;
/** Set by the Worker on a Blog 5xx it logged itself, so the app does not log the same failure again. */
export const blogErrorReportedHeader = "x-blog-error-reported";
