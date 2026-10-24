import { TRPCError } from "@trpc/server";
import { BlogError } from "@tudomacae/editorial-blog/blog";
import { blogErrorSchema, type BlogErrorShape, type BlogReadOperation, type BlogWriteOperation } from "@tudomacae/editorial-blog/protocol";
import type { EditorialPersistence } from "@tudomacae/editorial-persistence";
import { z } from "zod";
import type { EditorialImagePurge } from "@tudomacae/public-image-delivery/editorialPurge";
import { createEditorialBlog } from "./editorialBlog";
import { createEditorialMediaCleanup } from "./editorialMediaCleanup";
import { createBlogSynchronization, type ArticleIndexWriter } from "./editorialBlogSynchronization";
import { manager, readAccount, type ContextDependencies } from "./mediaHttp";

type BlogContextDependencies = ContextDependencies & {
  /** Absent while the deployment binds no index; saves then stay `unconfirmed` for distribution. */
  index?: ArticleIndexWriter;
  context: { environment: string; release: string };
  /** Absent while the deployment has no purge credentials; retired Media then stays pending and saves `unconfirmed`. */
  purge?: EditorialImagePurge;
};

/** Retired Media keys wait for the verified purge, so an article with any of them stays unconfirmed. */
async function pendingCleanup(persistence: Pick<EditorialPersistence, "read">, articleId: string) {
  const pending = (await persistence.read("article", articleId))?.body.pendingMediaPurges;
  return Array.isArray(pending) && pending.length > 0 ? "unconfirmed" as const : "confirmed" as const;
}

function cleanup(persistence: EditorialPersistence, dependencies: Pick<BlogContextDependencies, "purge" | "context">) {
  if (!dependencies.purge) return (articleId: string) => pendingCleanup(persistence, articleId);
  const media = createEditorialMediaCleanup({ persistence, purge: dependencies.purge, context: dependencies.context });
  return async (articleId: string, correlationId?: string) => (await media.synchronize(articleId, correlationId)).status;
}

/** The Blog for a live administrator or editor, acting as that account. */
export async function blogContext(dependencies: BlogContextDependencies) {
  const { service, account } = await manager(dependencies);
  const { persistence } = service;
  const blog = createEditorialBlog({
    persistence,
    identity: {
      async isOperator(id) {
        const operator = await readAccount(dependencies.accounts, id);
        return !!operator && !operator.disabled && (operator.claims.admin === true || operator.claims.editor === true);
      },
      displayName: async id => (await readAccount(dependencies.accounts, id))?.displayName,
    },
    synchronize: createBlogSynchronization({ persistence, index: dependencies.index, context: dependencies.context,
      cleanup: cleanup(persistence, dependencies) }),
  });
  const reads: Record<BlogReadOperation, (input: never) => Promise<unknown>> = {
    list: (cursor?: string) => blog.list(account.uid, cursor ?? undefined),
    get: (id: string) => blog.read(account.uid, id),
  };
  const writes: Record<BlogWriteOperation, (input: never, correlationId?: string) => Promise<unknown>> = {
    save: (input, correlationId) => blog.save(account.uid, input, correlationId),
    takeOffline: (input, correlationId) => blog.takeOffline(account.uid, input, correlationId),
  };
  return {
    read: (operation: BlogReadOperation, input: unknown) => reads[operation](input as never),
    write: (operation: BlogWriteOperation, input: unknown, correlationId?: string) => writes[operation](input as never, correlationId),
  };
}

export function blogError(error: unknown): BlogErrorShape | undefined {
  if (error instanceof BlogError) return { name: "BlogError", code: error.code, ...(error.field ? { field: error.field } : {}) };
  if (error instanceof z.ZodError) {
    const field = error.issues[0]?.path[0];
    return { name: "ValidationError", ...(typeof field === "string" ? { field } : {}) };
  }
  return undefined;
}

const codes = { forbidden: "FORBIDDEN", notFound: "NOT_FOUND", conflict: "CONFLICT", media: "BAD_REQUEST" } as const;

/** The public answer to any unexpected Blog failure; it names the capability and nothing about the cause. */
export const blogUnavailableMessage = "Não foi possível acessar o Blog. Tente novamente.";

/** Domain and validation errors keep the message the editor reads; anything else surfaces as an internal failure. */
export async function blogProcedure<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  }
  catch (cause) {
    const known = blogErrorSchema.safeParse(blogError(cause));
    if (!known.success) throw cause;
    const message = cause instanceof z.ZodError ? cause.issues[0]?.message ?? "Revise os campos." : (cause as Error).message;
    throw new TRPCError({ code: known.data.code ? codes[known.data.code] : "BAD_REQUEST", message, cause: cause as Error });
  }
}

/** The normalized failure route of a Blog procedure; Blog failures are their own signal, never authentication's. */
export const blogFailureRoute = (path: string) => /^\/api\/trpc\/blog(Read|Write)$/.test(path) ? path : undefined;
