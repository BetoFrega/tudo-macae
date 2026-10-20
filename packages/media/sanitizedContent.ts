import type { Media } from "./model";

export function sanitizedMediaPath(media: Pick<Media, "digest" | "storagePath" | "mimeType" | "status">, digest: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(digest) || media.digest !== digest
    || media.storagePath !== `media-staged/sha256-${digest}.webp`
    || media.mimeType !== "image/webp" || !["staged", "active"].includes(media.status)) return null;
  return media.storagePath;
}

export interface SanitizedMediaContentDependencies {
  digest(bytes: Uint8Array): Promise<string>;
  readMedia(id: string): Promise<Media | null>;
  readBytes(path: string): Promise<Uint8Array | null>;
}

export function createSanitizedMediaContent(dependencies: SanitizedMediaContentDependencies) {
  return {
    async read(id: string, digest: string) {
      const media = await dependencies.readMedia(id);
      const path = media ? sanitizedMediaPath(media, digest) : null;
      if (!path) return null;
      const bytes = await dependencies.readBytes(path);
      return bytes && await dependencies.digest(bytes) === digest ? { bytes, mimeType: "image/webp" } : null;
    },
  };
}
