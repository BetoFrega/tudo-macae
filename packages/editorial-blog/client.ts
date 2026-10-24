import { z } from "zod";
import { BlogError, type BlogPost, type BlogPostSummary, type SavePostInput } from "./blog";
import { blogErrorReportedHeader, blogErrorSchema, type BlogErrorShape, type BlogReadOperation, type BlogWriteOperation } from "./protocol";
import { serviceOrigin } from "./lib/serviceOrigin";

/** The Worker could not answer, or answered outside the Blog protocol; never a domain decision. */
export class BlogRequestError extends Error {
  /** `reportedByWorker` marks a failure the Worker already logged, so the caller does not log it again. */
  constructor(readonly code: "unavailable" | "incompatible", readonly reportedByWorker = false) {
    super("Não foi possível acessar o Blog. Tente novamente.");
    this.name = "BlogRequestError";
  }
}

/** Input the Worker refused before any decision; `field` names what the editor corrects. */
export class BlogInputError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "BlogInputError";
  }
}

const resultSchema = z.object({ result: z.object({ data: z.unknown() }) });
const failureSchema = z.object({ error: z.object({ message: z.string(), data: z.object({ code: z.string().optional(), blog: blogErrorSchema.optional() }).passthrough() }) });
const contentSchema = z.object({
  corrections: z.array(z.object({ summary: z.string(), createdAt: z.number(), editorId: z.string().optional() })).optional(),
  title: z.string(), body: z.string(), path: z.string(), editorName: z.string().optional(), assisted: z.boolean().optional(),
  sources: z.array(z.object({ name: z.string(), url: z.string().optional(), reportedAt: z.number().nullable().optional(), accessedAt: z.number().optional() })),
  media: z.array(z.object({ id: z.string(), digest: z.string().optional(), alt: z.string(), caption: z.string(), credit: z.string(), generated: z.boolean().optional() })),
  leadMediaId: z.string().nullable().optional(), legacyHeaderMediaIds: z.array(z.string()).optional(),
});
const status = z.enum(["draft", "published"]);
const postSchema = z.object({ id: z.string(), status, revision: z.number().int().nonnegative(), content: contentSchema, createdAt: z.number(), updatedAt: z.number(),
  publishedAt: z.number().optional(), scheduled: z.boolean().optional(), mediaIds: z.array(z.string()), createdBy: z.string().optional() });
const summarySchema = z.object({ id: z.string(), title: z.string(), status, publishedAt: z.number().optional(), scheduled: z.boolean().optional() });
const listSchema = z.object({ items: z.array(summarySchema), nextCursor: z.string().optional() });
const savedSchema = z.object({ post: postSchema, synchronization: z.enum(["confirmed", "unconfirmed"]) });
const fields = z.enum(["body", "leadMediaId"]).optional().catch(undefined);

function domainError(error: BlogErrorShape, message: string) {
  if (error.name === "ValidationError") return new BlogInputError(message, error.field);
  // A BlogError always carries its code; one without it is not an answer the editor can act on.
  return error.code ? new BlogError(error.code, message, fields.parse(error.field)) : new BlogRequestError("incompatible");
}

type Saved = { post: BlogPost; synchronization: "confirmed" | "unconfirmed" };

/**
 * The API Worker's Blog procedures for one session. `publicOrigin` is the app origin the Worker accepts on
 * mutations; the session is the only credential, so the Worker re-checks the live role on every call.
 */
export function createEditorialBlogClient(configuration: { origin: string; publicOrigin: string; allowLocal?: boolean; request?: typeof fetch }) {
  const origin = serviceOrigin(configuration);
  const publicOrigin = new URL(configuration.publicOrigin).origin;
  // A plain call: workerd rejects the global fetch invoked as a method of `configuration` (Illegal invocation).
  const send = configuration.request ?? fetch;
  function headers(session: string | undefined, extra: Record<string, string> = {}) {
    const value = new Headers({ origin: publicOrigin, ...extra });
    if (session) value.set("cookie", `session=${encodeURIComponent(session)}`);
    return value;
  }
  async function procedure<T>(path: string, init: RequestInit, timeout: number, schema: z.ZodType): Promise<T> {
    let response: Response;
    try {
      response = await send(new URL(path, origin), { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(timeout) });
    }
    catch { throw new BlogRequestError("unavailable"); }
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const failure = failureSchema.safeParse(value);
      const error = failure.data?.error.data.blog;
      if (failure.success && error) throw domainError(error, failure.data.error.message);
      // Only the Worker's own role check is a refusal; a bare 401/403 from an origin or gateway decides nothing.
      if (failure.success && failure.data.error.data.code === "FORBIDDEN") throw new BlogError("forbidden", "Acesso restrito a Administradores e Editores ativos.");
      throw new BlogRequestError("unavailable", response.headers.get(blogErrorReportedHeader) === "1");
    }
    const result = resultSchema.safeParse(value);
    const data = schema.safeParse(result.data?.result.data);
    if (!data.success) throw new BlogRequestError("incompatible");
    return data.data as T;
  }
  function read<T>(operation: BlogReadOperation, input: unknown, session: string | undefined, schema: z.ZodType) {
    const body = JSON.stringify({ operation, input: input ?? null });
    return procedure<T>(`/api/trpc/blogRead?input=${encodeURIComponent(body)}`, { method: "GET", headers: headers(session) }, 5_000, schema);
  }
  function write(operation: BlogWriteOperation, input: unknown, session: string | undefined, correlationId?: string) {
    const body = JSON.stringify({ operation, input, ...(correlationId ? { correlationId } : {}) });
    // A save commits and then waits for distribution and cleanup, so it outlives a read-sized limit.
    return procedure<Saved>("/api/trpc/blogWrite", { method: "POST", body, headers: headers(session, { "content-type": "application/json" }) }, 30_000, savedSchema);
  }
  return {
    list: (cursor: string | undefined, session: string | undefined) => read<{ items: BlogPostSummary[]; nextCursor?: string }>("list", cursor ?? null, session, listSchema),
    read: (id: string, session: string | undefined) => read<BlogPost | null>("get", id, session, postSchema.nullable()),
    save: (input: SavePostInput, session: string | undefined, correlationId?: string) => write("save", input, session, correlationId),
    takeOffline: (input: { id: string; expectedRevision: number }, session: string | undefined, correlationId?: string) => write("takeOffline", input, session, correlationId),
  };
}
