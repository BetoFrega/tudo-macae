import { publicBlogClient } from "./publicBlogProduction";

export async function readPublishedArticleMedia(
  articleId: string,
  mediaId: string,
  requestId?: string,
) {
  return publicBlogClient().articleMedia(articleId, mediaId, requestId);
}
