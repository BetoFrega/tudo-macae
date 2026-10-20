"use server";

import { forbidden, unauthorized } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/authentication/actions/getCurrentUser";
import { BlogError, savePostSchema, postRevisionSchema, type SavePostInput } from "@tudomacae/editorial-blog/blog";
import { BlogInputError, BlogRequestError } from "@tudomacae/editorial-blog/client";
import { workerBlog } from "@/packages/blog-api";
import { publicImageRuntimeContext } from "@/integrations/public-images/runtimeContext";
import { revalidateArticle } from "@/packages/news-cache";

function failureCategory(error: unknown) {
  if (error instanceof BlogRequestError) return error.code;
  if (error instanceof TypeError) return "type-error";
  if (error instanceof RangeError) return "range-error";
  return "unknown";
}

async function operator() {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  if (!user.isAdmin && !user.isEditor) forbidden();
  return user;
}

/** The Worker logged its own 5xx, under the mutation's correlation on writes, so only failures it never answered are logged here. */
const reportedByWorker = (error: unknown) => error instanceof BlogRequestError && error.reportedByWorker;

/** A read the Worker refused is a refusal; a failure it did not already log is logged here before the page fails. */
const readRoutes = { list: "server-component:/redacao/materias", get: "server-component:/redacao/materias/[id]" } as const;

async function readFrom<T>(operation: keyof typeof readRoutes, read: (blog: Awaited<ReturnType<typeof workerBlog>>) => Promise<T>) {
  await operator();
  try {
    return await read(await workerBlog());
  }
  catch (error) {
    if (error instanceof BlogError && error.code === "forbidden") forbidden();
    if (!reportedByWorker(error)) console.error(JSON.stringify({ event: "blog.read", ...publicImageRuntimeContext(), outcome: "error", route: readRoutes[operation], operation, failureCategory: failureCategory(error) }));
    throw error;
  }
}

/** What the editor corrects: a domain refusal or invalid input. */
function saveRefusal(error: unknown) {
  if (error instanceof BlogError) return { success: false as const, error: error.message, field: error.field };
  if (error instanceof z.ZodError) return { success: false as const, error: error.issues[0]?.message ?? "Revise os campos.", field: String(error.issues[0]?.path[0] ?? "") };
  if (error instanceof BlogInputError) return { success: false as const, error: error.message, field: error.field ?? "" };
  return undefined;
}

/**
 * Builds the Worker's Blog before any write starts. A failure here sent nothing, so the editor may retry without
 * reloading and losing unsaved text; only a failure after the write started is reported as unconfirmed.
 */
async function writableBlog(route: string, operation: string, correlationId: string) {
  try {
    return await workerBlog();
  }
  catch (error) {
    console.error(JSON.stringify({ event: "blog.mutation", ...publicImageRuntimeContext(), outcome: "error", route, operation, correlationId, stage: "configuration", failureCategory: failureCategory(error) }));
    return undefined;
  }
}

const selectionFailure = { success: false as const, error: "Não foi possível acessar o Blog. Nada foi gravado; tente novamente.", field: undefined, retryable: true as const };

export async function readBlogPost(id: string) {
  return readFrom("get", blog => blog.read(id));
}
export async function listBlogPosts(cursor?: string) {
  return readFrom("list", blog => blog.list(cursor));
}
export async function saveBlogPost(input: SavePostInput) {
  await operator();
  const correlationId = crypto.randomUUID();
  let stage = "mutation";
  try {
    const parsed = savePostSchema.parse(input);
    const target = await writableBlog("server-action:saveBlogPost", "save", correlationId);
    if (!target) return selectionFailure;
    const { post, synchronization } = await target.save(parsed, correlationId);
    stage = "cache-invalidation";
    revalidateArticle({ id: post.id, slug: post.content.path.split("/").at(-1)! });
    revalidatePath(post.content.path);
    revalidatePath("/redacao", "layout");
    console.info(JSON.stringify({ event: "blog.mutation", ...publicImageRuntimeContext(), outcome: "success", route: "server-action:saveBlogPost", operation: "save", correlationId, articleId: post.id, synchronization }));
    return { success: true as const, post, synchronization };
  }
  catch (error) {
    const refusal = saveRefusal(error);
    if (refusal) return refusal;
    if (!reportedByWorker(error)) console.error(JSON.stringify({ event: "blog.mutation", ...publicImageRuntimeContext(), outcome: "error", route: "server-action:saveBlogPost", operation: "save", correlationId, stage, failureCategory: failureCategory(error) }));
    return { success: false as const, error: "Operação não confirmada. Reabra a lista de posts para conferir o estado antes de tentar novamente.", field: undefined };
  }
}
export async function takeBlogPostOffline(input: z.input<typeof postRevisionSchema>) {
  await operator();
  const correlationId = crypto.randomUUID();
  let stage = "mutation";
  try {
    const parsed = postRevisionSchema.parse(input);
    const target = await writableBlog("server-action:takeBlogPostOffline", "takeOffline", correlationId);
    if (!target) return selectionFailure;
    const { post, synchronization } = await target.takeOffline(parsed, correlationId);
    stage = "cache-invalidation";
    revalidateArticle({ id: post.id, slug: post.content.path.split("/").at(-1)! });
    revalidatePath(post.content.path);
    revalidatePath("/redacao", "layout");
    console.info(JSON.stringify({ event: "blog.mutation", ...publicImageRuntimeContext(), outcome: "success", route: "server-action:takeBlogPostOffline", operation: "takeOffline", correlationId, articleId: post.id, synchronization }));
    return { success: true as const, post, synchronization };
  }
  catch (error) {
    if (error instanceof BlogError) return { success: false as const, error: error.message, field: error.field };
    if (error instanceof z.ZodError || error instanceof BlogInputError) return { success: false as const, error: "Reabra o post para conferir seu estado.", field: undefined };
    if (!reportedByWorker(error)) console.error(JSON.stringify({ event: "blog.mutation", ...publicImageRuntimeContext(), outcome: "error", route: "server-action:takeBlogPostOffline", operation: "takeOffline", correlationId, stage, failureCategory: failureCategory(error) }));
    return { success: false as const, error: "Operação não confirmada. Reabra o post para conferir seu estado.", field: undefined };
  }
}
