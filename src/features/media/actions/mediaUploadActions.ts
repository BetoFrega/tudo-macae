"use server";

import { updateTag } from "next/cache";
import type { Media } from "@tudomacae/media/model";
import { MediaRequestError } from "@tudomacae/editorial-media/client";
import { reportMediaFailure, workerMedia } from "@/packages/media-api";
import {
  assertMediaUploadCompatibility,
  MediaIngestionError,
  type FinalizeMediaUploadInput,
  type FinalizedMediaUpload,
  type PrepareMediaUploadInput,
  type PreparedMediaUpload,
  type SearchMediaUploadInput,
} from "@tudomacae/media/ingestionPolicy";

type Correlated<T> = T & { correlationId: string };
/** The Worker answers a search without the storage path. */
type MediaUploadSearchPage = { media: Array<Omit<Media, "storagePath">>; nextCursor?: string };

const refusedByWorker = (error: unknown): error is MediaRequestError => error instanceof MediaRequestError && error.code === "forbidden";

function reportFailure(error: unknown, operation: string) {
  if (error instanceof MediaIngestionError && error.code !== "internalFailure") return;
  reportMediaFailure(error, operation, `server-action:${operation}`);
}

function failure(error: unknown, operation: string) {
  reportFailure(error, operation);
  return {
    success: false as const,
    error:
      error instanceof MediaIngestionError || refusedByWorker(error)
        ? error.message
        : "Não foi possível concluir a operação de Mídia. Tente novamente.",
    code: error instanceof MediaIngestionError || refusedByWorker(error) ? error.code : "internalFailure",
    details: error instanceof MediaIngestionError ? error.details : {},
  };
}

/** The Worker authorizes the session itself. */
async function prepare(input: PrepareMediaUploadInput) {
  return (await workerMedia()).write<Correlated<PreparedMediaUpload>>("ingestion.prepare", input);
}

async function search(input: SearchMediaUploadInput) {
  return (await workerMedia()).read<MediaUploadSearchPage>("ingestion.search", input);
}

export async function prepareMediaUploadAction(input: PrepareMediaUploadInput) {
  try {
    return {
      success: true as const,
      ...(await prepare(input)),
    };
  }
  catch (error) {
    return failure(error, "media.upload.prepare");
  }
}

export async function finalizeMediaUploadAction(
  input: FinalizeMediaUploadInput,
) {
  try {
    const result = await (await workerMedia()).write<Correlated<FinalizedMediaUpload>>("ingestion.finalize", input);
    assertMediaUploadCompatibility(result);
    updateTag("media");
    return { success: true as const, ...result };
  }
  catch (error) {
    return failure(error, "media.upload.finalize");
  }
}

export async function searchMediaUploadAction(input: SearchMediaUploadInput) {
  try {
    return {
      success: true as const,
      ...(await search(input)),
    };
  }
  catch (error) {
    return failure(error, "media.upload.search");
  }
}

export async function selectExistingMediaAction(id: string) {
  try {
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,200}$/.test(id))
      throw new MediaIngestionError(
        "validationFailed",
        "Escolha uma Mídia válida.",
      );
    const media = await (await workerMedia()).read<Media | null>("get", id);
    if (!media)
      throw new MediaIngestionError(
        "notFound",
        "A Mídia escolhida não existe.",
      );
    return { success: true as const, mediaId: media.id };
  }
  catch (error) {
    return failure(error, "media.upload.select");
  }
}
