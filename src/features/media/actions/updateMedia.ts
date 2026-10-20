"use server";

import { revalidateTag, updateTag } from "next/cache";
import type { z } from "zod";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { MediaNotFoundError, MediaRevisionConflictError } from "@tudomacae/media/errors";
import { MediaIngestionError } from "@tudomacae/media/ingestionPolicy";
import { MediaRequestError } from "@tudomacae/editorial-media/client";
import { reportedByWorker, workerMedia } from "@/packages/media-api";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import {
  mediaMetadataFromForm,
  updateMediaFormSchema,
  type UpdateMediaFormInput,
  type UpdateMediaResult,
} from "@tudomacae/media/form";

type MediaManager = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type UpdateMediaRequest = z.output<typeof updateMediaFormSchema>;

/**
 * Admins update metadata directly; Editors correct it with a reason. The Worker records the actor from the session
 * and re-checks the live role of each operation.
 */
async function saveMetadata(user: MediaManager, request: UpdateMediaRequest): Promise<UpdateMediaResult | undefined> {
  const metadata = mediaMetadataFromForm(request.form);
  const worker = await workerMedia();
  if (!user.isEditor) {
    await worker.write("update", { id: request.id, expectedRevision: request.expectedRevision, metadata });
    return undefined;
  }
  if (!request.reason?.trim()) return { success: false, error: "Informe o motivo da correção." };
  await worker.write("correct", {
    mediaId: request.id,
    expectedRevision: request.expectedRevision,
    reason: request.reason,
    metadata: { alt: metadata.alt, caption: metadata.caption, provenance: metadata.provenance },
  });
  return undefined;
}

/** Refusals explained to the person; anything else is reported and answered generically. */
const isRefusal = (error: unknown): error is Error => error instanceof MediaRevisionConflictError
  || error instanceof MediaNotFoundError
  || (error instanceof MediaRequestError && error.code === "forbidden")
  || (error instanceof MediaIngestionError && error.code !== "internalFailure");

function reportUpdateFailure(error: unknown) {
  if (reportedByWorker(error)) return;
  console.error(JSON.stringify({
    event: "media.update.failed",
    ...publicImageRuntimeContext(),
    route: "server-action:updateMedia",
    executionId: crypto.randomUUID(),
    operation: "media.update",
    outcome: "error",
    statusClass: "5xx",
    errorType: error instanceof Error ? error.constructor.name : "UnknownError",
  }));
}

/** Edits metadata only — the stored file is never swapped by an edit. */
export async function updateMedia(
  input: UpdateMediaFormInput,
): Promise<UpdateMediaResult> {
  const user = await getCurrentUser();
  if (!user || (!user.isEditor && !user.isAdmin)) {
    return {
      success: false,
      error: "Você não tem permissão para gerenciar o acervo de mídia.",
    };
  }

  const parsed = updateMediaFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados da mídia inválidos.",
    };
  }

  try {
    const rejection = await saveMetadata(user, parsed.data);
    if (rejection) return rejection;

    revalidateTag("media", "max");
    updateTag("media");

    return { success: true };
  }
  catch (error) {
    if (isRefusal(error)) {
      return { success: false, error: error.message };
    }
    reportUpdateFailure(error);
    return { success: false, error: "Falha ao atualizar a mídia." };
  }
}
