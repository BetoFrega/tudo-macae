import type { Media } from "@tudomacae/media/model";
import { sanitizedMediaPath } from "@tudomacae/media/sanitizedContent";
import { samePublicationGrant, type MediaPublicationGrant } from "@tudomacae/media/publicationGrants";
import { publishedReceipt, type PublicationReadState } from "./publishedArticle";

export interface PublicMediaContentDependencies {
  now(): number;
  readMedia(id: string): Promise<Pick<Media, "status" | "digest" | "storagePath" | "mimeType"> | null>;
  readGrants(id: string): Promise<MediaPublicationGrant[]>;
  readPublication(id: string): Promise<PublicationReadState>;
  readContent(id: string, digest: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
}

export class PublicMediaReadFailure extends Error {
  /** `reportedByWorker`: the API Worker already logged this failure, so the origin does not log it again. */
  constructor(public readonly stage: "media" | "grants" | "publication" | "storage" | "worker", public readonly reportedByWorker = false) {
    super("Editorial image dependency failed");
  }
}

async function readDependency<T>(stage: PublicMediaReadFailure["stage"], read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  }
  catch {
    throw new PublicMediaReadFailure(stage);
  }
}

export function createPublicMediaContent(dependencies: PublicMediaContentDependencies) {
  async function isPublic(id: string, digest: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[a-f0-9]{64}$/.test(digest)) return false;
    const media = await readDependency("media", () => dependencies.readMedia(id));
    if (!media || media.status !== "active" || !sanitizedMediaPath(media, digest)) return false;
    const grants = await readDependency("grants", () => dependencies.readGrants(id));
    return hasPublishedGrant(grants.filter(grant => grant.mediaId === id && grant.digest === digest));
  }
  async function hasPublishedGrant(grants: MediaPublicationGrant[]): Promise<boolean> {
    const now = dependencies.now();
    const publications = new Map<string, ReturnType<typeof publishedReceipt>>();
    for (const grant of grants) {
      if (!publications.has(grant.articleId)) {
        publications.set(grant.articleId, publishedReceipt(grant.articleId, await readDependency("publication", () => dependencies.readPublication(grant.articleId)), now));
      }
      const receipt = publications.get(grant.articleId);
      if (receipt?.grants.some(item => samePublicationGrant(item, grant))) {
        return true;
      }
    }
    return false;
  }
  return {
    isPublic,
    async read(id: string, digest: string) {
      return await isPublic(id, digest) ? readDependency("storage", () => dependencies.readContent(id, digest)) : null;
    },
  };
}
