"use client";

import { finalizeMediaUploadAction, prepareMediaUploadAction, searchMediaUploadAction, selectExistingMediaAction } from "./actions/mediaUploadActions";
import { mediaFormSchema, mediaMetadataFromForm, type CreateMediaResult } from "@tudomacae/media/form";
import { validatedMediaUpload, MediaIngestionError, type PreparedMediaUpload } from "@tudomacae/media/ingestionPolicy";

interface UploadAttempt {
  fingerprint: string;
  key: string;
  prepared?: PreparedMediaUpload;
  uploaded: boolean;
}

const attempts = new WeakMap<File, UploadAttempt>();

type MediaMetadata = ReturnType<typeof mediaMetadataFromForm>;
type Step<T> = T | { failure: CreateMediaResult };

/** Browser orchestration: only metadata and opaque references cross Server Actions. */
export async function createMedia(formData: FormData): Promise<CreateMediaResult> {
  const existingMediaId = formData.get("existingMediaId");
  if (typeof existingMediaId === "string") return selectExistingMediaAction(existingMediaId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { success: false, error: "Escolha o arquivo da mídia." };
  try {
    return await uploadMedia(formData, file);
  }
  catch (error) {
    if (error instanceof MediaIngestionError) return { success: false, error: error.message, code: error.code, details: error.details };
    return { success: false, error: "Não foi possível concluir o envio. Tente novamente com o mesmo arquivo." };
  }
}

async function uploadMedia(formData: FormData, file: File): Promise<CreateMediaResult> {
  const fields = Object.fromEntries([...formData.entries()].filter(([key]) => key !== "file" && key !== "confirmNew"));
  const parsed = mediaFormSchema.safeParse(fields);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const metadata = mediaMetadataFromForm(parsed.data);
  const resolved = await resolveAttempt(formData, file, metadata);
  if ("failure" in resolved) return resolved.failure;
  const { attempt } = resolved;
  const preparation = await prepareAttempt(file, attempt, metadata);
  if ("failure" in preparation) return preparation.failure;
  const uploadFailure = await uploadFile(file, attempt, preparation.prepared);
  if (uploadFailure) return uploadFailure;
  const result = await finalizeMediaUploadAction({ reservationId: preparation.prepared.reservationId, idempotencyKey: attempt.key });
  if (!result.success && result.details.reservationExpired === true) attempts.delete(file);
  return result.success ? { success: true, mediaId: result.mediaId } : result;
}

/** An attempt is reused unless the metadata changed or its unused reservation expired. */
function isReusable(attempt: UploadAttempt | undefined, fingerprint: string): attempt is UploadAttempt {
  if (!attempt || attempt.fingerprint !== fingerprint) return false;
  return attempt.uploaded || !attempt.prepared || attempt.prepared.expiresAt > Date.now();
}

async function resolveAttempt(formData: FormData, file: File, metadata: MediaMetadata): Promise<Step<{ attempt: UploadAttempt }>> {
  const fingerprint = JSON.stringify(metadata);
  const current = attempts.get(file);
  if (isReusable(current, fingerprint)) return { attempt: current };
  const search = await searchMediaUploadAction({ kind: metadata.kind, text: metadata.alt.slice(0, 200), limit: 5 });
  if (!search.success) return { failure: search };
  if (search.media.length && formData.get("confirmNew") !== "true") {
    return { failure: { success: false, error: "Encontramos Mídias no acervo. Reaproveite uma ou confirme um novo envio.", matches: search.media.map(({ id, alt }) => ({ id, alt })) } };
  }
  const attempt: UploadAttempt = { fingerprint, key: crypto.randomUUID(), uploaded: false };
  attempts.set(file, attempt);
  return { attempt };
}

async function prepareAttempt(file: File, attempt: UploadAttempt, metadata: MediaMetadata): Promise<Step<{ prepared: PreparedMediaUpload }>> {
  if (attempt.prepared) return { prepared: attempt.prepared };
  const input = validatedMediaUpload({ idempotencyKey: attempt.key, size: file.size, contentType: file.type as "image/webp", metadata });
  const prepared = await prepareMediaUploadAction(input);
  if (!prepared.success) {
    if (prepared.details.reservationExpired === true) attempts.delete(file);
    return { failure: prepared };
  }
  attempt.prepared = prepared;
  return { prepared };
}

async function uploadFile(file: File, attempt: UploadAttempt, prepared: PreparedMediaUpload): Promise<CreateMediaResult | undefined> {
  if (attempt.uploaded) return undefined;
  const uploaded = await fetch(prepared.upload.url, {
    // The app's own upload route forwards the session to the API Worker; a cross-origin signed URL never gets cookies.
    method: "PUT", headers: prepared.upload.headers, body: file, credentials: "same-origin",
  });
  if (!uploaded.ok && uploaded.status !== 412 && uploaded.status !== 409) return { success: false, error: "Não foi possível enviar o arquivo. Tente novamente." };
  attempt.uploaded = true;
  return undefined;
}
