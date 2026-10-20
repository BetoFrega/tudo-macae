import { createPublicMediaContent, PublicMediaReadFailure, type PublicMediaContentDependencies } from "@tudomacae/editorial-blog/publicMediaContent";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { publishedReceipt } from "@tudomacae/editorial-blog/publishedArticle";
import { articleMediaId, articleMediaRoute, editorialImageOriginRoute } from "@tudomacae/editorial-blog/publicProtocol";
import { createGrantedMediaContent } from "@tudomacae/media/publicationGrants";
import { sanitizedMediaPath } from "@tudomacae/media/sanitizedContent";
import { grantSchema, readPublicationState } from "./db/editorialPublicBlog";
import { parseStoredMedia, readPages, toMedia } from "./db/editorialMedia";
import type { EditorialMediaService } from "./mediaHttp";

// The same headers as the Next origin: no shared cache stores bytes it authorizes on every miss.
const headers = { "cache-control": "private, no-store", "cdn-cache-control": "no-store", "x-content-type-options": "nosniff" };
export const isEditorialImageRoute = (path: string) => editorialImageOriginRoute.test(path) || articleMediaRoute.test(path);
/** The normalized route of a public image request, so its failures are the Blog's signal rather than account access. */
export function editorialImageFailureRoute(path: string) {
  if (editorialImageOriginRoute.test(path)) return "/api/imagens/editorial/:mediaId/:digest";
  return articleMediaRoute.test(path) ? "/api/noticia/:articleId/midias/:mediaId" : undefined;
}

async function stage<T>(name: PublicMediaReadFailure["stage"], read: () => Promise<T>) {
  try {
    return await read();
  }
  catch {
    throw new PublicMediaReadFailure(name);
  }
}

/** Whether a Media digest is public over the editorial D1: active and granted to a published post. */
export function editorialPublicMedia(persistence: EditorialPersistence, readContent: PublicMediaContentDependencies["readContent"], now = Date.now) {
  return createPublicMediaContent({
    now,
    async readMedia(id) {
      const record = await persistence.read("media", id);
      return record && toMedia(record);
    },
    readGrants: async id => (await readPages(persistence, { kind: "publicationGrant", mediaId: id })).map(record => parseStoredMedia(grantSchema, record.body)),
    readPublication: articleId => readPublicationState(persistence, articleId),
    readContent,
  });
}

/** `head` authorizes without the provider read: the image is public once its record and grant are, whatever its bytes. */
function publicImages(service: EditorialMediaService, head: boolean) {
  const { persistence } = service;
  const readPublication = (articleId: string) => readPublicationState(persistence, articleId);
  async function readContent(_mediaId: string, digest: string) {
    if (head) return { bytes: new Uint8Array(), mimeType: "image/webp" };
    // Authorized Media keeps its bytes: no Media operation removes those of granted Media, so absence is storage loss.
    const bytes = await stage("storage", async () => {
      const value = await service.bytes.readMedia(digest);
      if (!value) throw new Error("Bytes ausentes");
      return value;
    });
    return { bytes, mimeType: "image/webp" };
  }
  return {
    origin: editorialPublicMedia(persistence, readContent),
    article: createGrantedMediaContent({
      async readAccess(articleId, mediaId) {
        const receipt = publishedReceipt(articleId, await stage("publication", () => readPublication(articleId)), Date.now());
        return { published: receipt !== null, grant: receipt?.grants.find(item => item.mediaId === mediaId) ?? null, receiptGrants: receipt?.grants ?? [] };
      },
      // The current Media record still decides the bytes, as in the legacy origin: a receipt grant alone is not enough.
      async readContent(mediaId, digest) {
        const media = await stage("media", async () => {
          const record = await persistence.read("media", mediaId);
          return record && toMedia(record);
        });
        return media && sanitizedMediaPath(media, digest) ? readContent(mediaId, digest) : null;
      },
    }),
  };
}

async function read(path: string, service: EditorialMediaService, head: boolean) {
  const images = publicImages(service, head);
  const origin = editorialImageOriginRoute.exec(path);
  if (origin) return images.origin.read(origin[1]!, origin[2]!);
  const [, articleId, segment] = articleMediaRoute.exec(path)!;
  const mediaId = articleMediaId(segment!);
  return mediaId ? images.article.read(articleId!, mediaId) : null;
}

/**
 * Bytes of Media granted to a published post, read from Hosted Images on every request: the images Worker calls this
 * only on a cache miss. Closed, like every public Blog read, until the Worker owns editorial writes.
 */
export async function serveEditorialImage(request: Request, path: string, dependencies: { service?: EditorialMediaService | undefined; report(stage: string): void }) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
  const { service } = dependencies;
  let content;
  try {
    if (!service || await service.authority() !== "worker") return new Response(null, { status: 404, headers });
    content = await read(path, service, request.method === "HEAD");
  }
  catch (error) {
    dependencies.report(error instanceof PublicMediaReadFailure ? error.stage : "initialization");
    return new Response(null, { status: 502, headers });
  }
  if (!content) return new Response(null, { status: 404, headers });
  return new Response(request.method === "HEAD" ? null : new Uint8Array(content.bytes), { headers: { ...headers, "content-type": content.mimeType } });
}
