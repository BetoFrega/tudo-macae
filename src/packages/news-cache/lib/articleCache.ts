import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import type { ArticleCacheSubject } from "./cacheSubjects";

/** The newsroom's list of articles, which every change to any of them ages. */
export function revalidateArticles() {
  revalidateTag("news-articles", "max");
  updateTag("news-articles");
  revalidateTag("news-articles-published", "max");
  updateTag("news-articles-published");
}

/**
 * Everything that goes stale when one article changes, in one place so no
 * caller has to remember the list. The public routes are invalidated by path
 * because that is what a reader asks for; the newsroom reads by tag.
 *
 * Paths also refresh client navigation after an editorial mutation.
 */
export function revalidateArticle({ id, slug }: ArticleCacheSubject) {
  revalidateArticles();
  revalidateTag(`article-${id}`, "max");
  updateTag(`article-${id}`);
  revalidatePath(`/noticia/${id}/${slug}`);
  revalidatePath("/noticias");
}
