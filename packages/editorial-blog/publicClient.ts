import { z } from "zod";
import type { PublicBlogArticle, PublicBlogPage } from "./publicBlog";
import { articleMediaId, articleMediaPath, articleMediaRoute, blogPublicErrorReportedHeader, blogPublicReadPath, editorialImageOriginPath, editorialImageOriginRoute, publicArticleIdPattern, publicBlogArticleSchema, publicBlogPageSchema, type BlogPublicReadInput } from "./publicProtocol";
import { serviceOrigin } from "./lib/serviceOrigin";

/** The Worker could not answer, or answered outside the Blog protocol; never a public decision. */
export class PublicBlogRequestError extends Error {
  /** `reportedByWorker` marks a failure the Worker already logged, so the caller does not log it again. */
  constructor(readonly code: "unavailable" | "incompatible", readonly status?: number, readonly reportedByWorker = false) {
    super("Não foi possível carregar o Blog. Tente novamente.");
    this.name = "PublicBlogRequestError";
  }
}

const reported = (response: Response) => response.status >= 500 && response.headers.get(blogPublicErrorReportedHeader) === "1";
const resultSchema = z.object({ result: z.object({ data: z.unknown() }) });

/** The API Worker's public Blog reads; they carry no credential, only the app origin and the request id. */
export function createPublicBlogClient(configuration: { origin: string; publicOrigin: string; allowLocal?: boolean; request?: typeof fetch }) {
  const origin = serviceOrigin(configuration);
  const publicOrigin = new URL(configuration.publicOrigin).origin;
  // A plain call: workerd rejects the global fetch invoked as a method of `configuration` (Illegal invocation).
  const send = configuration.request ?? fetch;
  async function read(input: BlogPublicReadInput, requestId: string) {
    const url = new URL(`${blogPublicReadPath}?input=${encodeURIComponent(JSON.stringify(input))}`, origin);
    let response;
    try {
      response = await send(url, { method: "GET", headers: { "origin": publicOrigin, "x-request-id": requestId }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5_000) });
    }
    catch { throw new PublicBlogRequestError("unavailable"); }
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new PublicBlogRequestError("unavailable", response.status, reported(response));
    const result = resultSchema.safeParse(value);
    if (!result.success) throw new PublicBlogRequestError("incompatible", response.status);
    return result.data.result.data;
  }
  async function imageResponse(path: string, requestId: string, method: "GET" | "HEAD") {
    try {
      return await send(new URL(path, origin), { method, headers: { "x-request-id": requestId }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5_000) });
    }
    catch { throw new PublicBlogRequestError("unavailable"); }
  }
  /** The image's MIME type, or `null` when the Worker answers that it is not public. */
  async function publicImageType(response: Response) {
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404) return null;
      throw new PublicBlogRequestError("unavailable", response.status, reported(response));
    }
    const mimeType = response.headers.get("content-type");
    if (!mimeType?.startsWith("image/")) throw new PublicBlogRequestError("incompatible", response.status);
    return mimeType;
  }
  /** Public image bytes, or `null` when the Worker answers that they are not public; HEAD reads no body. */
  async function bytes(path: string, requestId: string, method: "GET" | "HEAD" = "GET") {
    const response = await imageResponse(path, requestId, method);
    const mimeType = await publicImageType(response);
    if (!mimeType) return null;
    if (method === "HEAD") {
      await response.body?.cancel();
      return { bytes: new Uint8Array(), mimeType };
    }
    const body = await response.arrayBuffer().catch(() => {
      throw new PublicBlogRequestError("unavailable", response.status);
    });
    return { bytes: new Uint8Array(body), mimeType };
  }
  return {
    /** Bytes of a Media granted to a published post, as the images Worker reads them on a cache miss. */
    async editorialImage(mediaId: string, digest: string, requestId = crypto.randomUUID(), method: "GET" | "HEAD" = "GET") {
      const path = editorialImageOriginPath(mediaId, digest);
      return editorialImageOriginRoute.test(path) ? bytes(path, requestId, method) : null;
    },
    /** Bytes of a Media the published edition of `articleId` granted. */
    async articleMedia(articleId: string, mediaId: string, requestId = crypto.randomUUID()) {
      const path = articleMediaPath(articleId, mediaId);
      const match = articleMediaRoute.exec(path);
      return match && articleMediaId(match[2]!) === mediaId ? bytes(path, requestId) : null;
    },
    async article(id: string, requestId = crypto.randomUUID()): Promise<PublicBlogArticle> {
      // The same answers as the module for an ID outside the article shape, without a request the protocol would refuse.
      if (!publicArticleIdPattern.test(id)) return { kind: "unavailable" };
      const value = publicBlogArticleSchema.safeParse(await read({ operation: "article", input: { id } }, requestId));
      if (!value.success) throw new PublicBlogRequestError("incompatible");
      return value.data as PublicBlogArticle;
    },
    async page(cursor?: string, requestId = crypto.randomUUID()): Promise<PublicBlogPage> {
      const valid = cursor && publicArticleIdPattern.test(cursor) ? { cursor } : {};
      const value = publicBlogPageSchema.safeParse(await read({ operation: "page", input: valid }, requestId));
      if (!value.success) throw new PublicBlogRequestError("incompatible");
      return value.data as PublicBlogPage;
    },
  };
}
