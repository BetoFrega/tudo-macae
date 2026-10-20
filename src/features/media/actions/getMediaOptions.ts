"use server";

import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { Media } from "@tudomacae/media/model";
import { unreportedFailure, workerMedia } from "@/packages/media-api";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import type { MediaKind } from "@tudomacae/media/model";
import {
  toMediaOption,
  type MediaOptionsResult,
} from "../mediaOptions";

async function readMediaOptions(kind: MediaKind, cursor?: string) {
  const input = { kind, limit: 50, ...(cursor ? { cursor } : {}) };
  const page = await (await workerMedia()).read<{ media: Media[]; nextCursor?: string }>("search", input);
  return {
    options: await Promise.all(page.media.map(toMediaOption)),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}

/** Resolve the canonical item returned by a deduplicated upload, even when it
 * falls outside the first page of the library. */
export async function getMediaOptionById(id: string) {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.isEditor) return null;
  try {
    const media = await (await workerMedia()).read<Media | null>("get", id);
    return media ? await toMediaOption(media) : null;
  }
  catch (error) {
    if (unreportedFailure(error)) console.error(JSON.stringify({
      event: "media.options.resolve.failed",
      ...publicImageRuntimeContext(),
      route: "server-action:getMediaOptionById",
      executionId: crypto.randomUUID(),
      operation: "media.options.resolve",
      outcome: "error",
      statusClass: "5xx",
      errorType: error instanceof Error ? "Error" : "UnknownError",
    }));
    return null;
  }
}

/**
 * What the picker offers for one kind, newest first, with the file's URL
 * already built — the picker runs in the browser and the bucket configuration
 * does not. Every call reads the current library after authorization.
 *
 * The picker is a client component, so this is an endpoint anyone can call:
 * it authorizes like every other action of the acervo does. An editor gets in
 * as well as an administrator — the acervo exists to be drawn on while writing
 * an article, and a newsroom that has to ask an administrator for every
 * photograph is a newsroom that stops using the acervo.
 */
export async function getMediaOptions(
  kind: MediaKind,
  cursor?: string,
): Promise<MediaOptionsResult> {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.isEditor) {
    return {
      success: false,
      error: "Você não tem permissão para gerenciar o acervo de mídia.",
    };
  }

  try {
    return { success: true, ...await readMediaOptions(kind, cursor) };
  }
  catch (error) {
    if (unreportedFailure(error)) console.error(JSON.stringify({
      event: "media.options.read.failed",
      ...publicImageRuntimeContext(),
      route: "server-action:getMediaOptions",
      executionId: crypto.randomUUID(),
      operation: cursor ? "media.options.next_page" : "media.options.read",
      outcome: "error",
      statusClass: "5xx",
      errorType: error instanceof Error ? "Error" : "UnknownError",
    }));
    return { success: false, error: "Não foi possível ler o acervo." };
  }
}
