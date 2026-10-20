import type { Media } from "./model";

export type MediaOption = Omit<Media, "storagePath"> & { url: string };
export type MediaOptionsResult
  = | { success: true; options: MediaOption[]; nextCursor?: string }
    | { success: false; error: string };
