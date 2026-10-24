import { TRPCError } from "@trpc/server";
import { createPublicBlog } from "@tudomacae/editorial-blog/publicBlog";
import { blogPublicReadPath, type BlogPublicReadInput } from "@tudomacae/editorial-blog/publicProtocol";
import { createPublicBlogStore } from "./db/editorialPublicBlog";
import { editorialImageFailureRoute } from "./editorialImageHttp";
import { readIdentityAccount } from "./db/identityAccounts";
import type { EditorialMediaService } from "./mediaHttp";

export const blogPublicUnavailableMessage = "Não foi possível carregar o Blog. Tente novamente.";
/** The failure route of a public Blog read or image, so its failures are their own signal rather than account access. */
export const blogPublicFailureRoute = (path: string) => (path === blogPublicReadPath ? path : editorialImageFailureRoute(path));

/** Public Blog reads over the editorial D1; absent, like Media, without the editorial binding. */
export async function blogPublicContext(dependencies: { service?: EditorialMediaService | undefined; accounts: D1Database }) {
  const { service } = dependencies;
  if (!service) throw new TRPCError({ code: "NOT_FOUND" });
  const blog = createPublicBlog({ now: Date.now, ...createPublicBlogStore(service.persistence, async uid => (await readIdentityAccount(dependencies.accounts, uid))?.displayName) });
  return {
    read: (input: BlogPublicReadInput) => (input.operation === "article" ? blog.article(input.input.id) : blog.page(input.input.cursor)),
  };
}
