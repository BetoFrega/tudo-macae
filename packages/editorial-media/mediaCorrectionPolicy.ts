import { z } from "zod";
import { articleImageMetadataInputSchema } from "@tudomacae/media/model";

export const mediaCorrectionMetadataSchema = articleImageMetadataInputSchema;
export const correctMediaMetadataSchema = z.strictObject({
  mediaId: z.string().trim().min(1).max(200).regex(/^[^/]+$/u),
  expectedRevision: z.number().int().positive(),
  metadata: mediaCorrectionMetadataSchema,
  reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.string().trim().min(1).max(200).regex(/^[^/]+$/u).optional(),
});
export type CorrectMediaMetadataInput = z.infer<typeof correctMediaMetadataSchema>;

export interface MediaCorrectionProposal {
  id: string;
  mediaId: string;
  expectedRevision: number;
  metadata: z.infer<typeof mediaCorrectionMetadataSchema>;
  reason: string;
  editorId: string;
  editorialClientId: string;
  /** Present on historical proposals created under delegated authorization. */
  editorialDelegationId?: string;
  createdAt: number;
  status: "pending" | "applied" | "rejected";
  decidedBy?: string;
  decidedAt?: number;
  decisionReason?: string;
}
