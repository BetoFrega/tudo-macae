import { z } from "zod";
import { mediaMetadataInputSchema } from "./model";

export const mediaUploadLimits = {
  maxBytes: 1_048_576,
  maxPixels: 16_000_000,
  maxDimension: 8_192,
  expiresAfterMs: 600_000,
  quarantineRetentionMs: 86_400_000,
} as const;

export const mediaUploadContentTypes = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
] as const;

export const mediaUploadKeySchema = z.string().trim().min(1).max(200);

export const searchMediaUploadSchema = z.strictObject({
  kind: z.literal("article-image").optional(),
  text: z.string().trim().min(1).max(200).optional(),
  credit: z.string().trim().min(1).max(200).optional(),
  provenance: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(4_000).optional(),
});
export type SearchMediaUploadInput = z.infer<typeof searchMediaUploadSchema>;

export const prepareMediaUploadSchema = z.strictObject({
  idempotencyKey: mediaUploadKeySchema,
  size: z.number().int().min(1).max(mediaUploadLimits.maxBytes),
  contentType: z.enum(mediaUploadContentTypes),
  metadata: mediaMetadataInputSchema,
});

export type PrepareMediaUploadInput = z.infer<typeof prepareMediaUploadSchema>;

export const finalizeMediaUploadSchema = z.strictObject({
  reservationId: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: mediaUploadKeySchema,
});
export type FinalizeMediaUploadInput = z.infer<typeof finalizeMediaUploadSchema>;

export interface FinalizedMediaUpload {
  status: "created" | "duplicate" | "conflict";
  mediaId: string;
  digest: string;
}

export class MediaIngestionError extends Error {
  constructor(
    public readonly code: "validationFailed" | "forbidden" | "notFound"
      | "duplicate" | "revisionConflict" | "internalFailure",
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "MediaIngestionError";
  }
}

export function validatedMediaUpload(input: PrepareMediaUploadInput) {
  const result = prepareMediaUploadSchema.safeParse(input);
  if (!result.success) {
    throw new MediaIngestionError(
      "validationFailed",
      "Informe metadados válidos e uma imagem JPEG, PNG, WebP ou GIF de até 1 MiB.",
    );
  }
  return result.data;
}

export interface PreparedMediaUpload {
  reservationId: string;
  expiresAt: number;
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
}

export function assertMediaUploadCompatibility(result: FinalizedMediaUpload) {
  if (result.status === "conflict") {
    throw new MediaIngestionError("revisionConflict", "O arquivo já existe com metadados ou Procedência diferentes. Solicite revisão humana.", { canonicalMediaId: result.mediaId });
  }
}
