"use server";

import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import type { Media } from "@tudomacae/media/model";
import { reportMediaFailure, workerMedia } from "@/packages/media-api";
import { toMediaOption, type MediaOption } from "../mediaOptions";

type MediaPage = { media: Media[]; nextCursor?: string };

/** The Worker's page; a failure is reported here, where the action answers it, then rethrown. */
async function readPage(operation: "search" | "unreferenced", input: { limit: number; cursor?: string }) {
  try {
    return await (await workerMedia()).read<MediaPage>(operation, input);
  }
  catch (error) {
    reportMediaFailure(error, `media.catalog.${operation}`, "server-action:getMedia");
    throw error;
  }
}

export async function getMedia(cursor?: string) {
  const user = await getCurrentUser();
  if (!user) return { media: [] as MediaOption[], requiresCorrectionReason: false };
  if (!user.isAdmin && !user.isEditor) {
    return { media: [] as MediaOption[], requiresCorrectionReason: false };
  }
  const page = await readPage("search", { limit: 50, ...(cursor ? { cursor } : {}) });
  return {
    media: await Promise.all(page.media.map(toMediaOption)),
    requiresCorrectionReason: user.isEditor,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}

export async function getUnreferencedStagedMedia(cursor?: string) {
  const user = await getCurrentUser();
  if (!user) return { media: [] as MediaOption[] };
  if (!user.isAdmin) return { media: [] as MediaOption[] };
  const report = await readPage("unreferenced", { limit: 50, ...(cursor ? { cursor } : {}) });
  return {
    media: await Promise.all(report.media.map(toMediaOption)),
    ...(report.nextCursor ? { nextCursor: report.nextCursor } : {}),
  };
}
