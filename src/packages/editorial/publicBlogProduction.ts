import { cache } from "react";
import { createPublicBlogClient } from "@tudomacae/editorial-blog/publicClient";

/** The API Worker's public Blog reads. A missing origin is a broken deployment, so it throws. */
export function publicBlogClient() {
  const origin = process.env.AUTHENTICATION_API_URL;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin || !publicOrigin) throw new Error("Blog configuration missing");
  return createPublicBlogClient({ origin, publicOrigin, allowLocal: true });
}

/** One read per request: metadata and the page body share it. */
export const readPublicBlogArticle = cache(async (id: string) => publicBlogClient().article(id));
export async function readPublicBlogPage(cursor?: string) {
  return publicBlogClient().page(cursor);
}
