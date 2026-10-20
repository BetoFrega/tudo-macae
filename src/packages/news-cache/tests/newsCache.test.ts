import { describe, expect, test, vi } from "vitest";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { revalidateArticle, revalidateArticles } from "..";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
const article = { id: "article-1", slug: "a-obra-da-orla" };
describe("blog cache invalidation", () => {
  test("invalidates one Article's page, public lists, home and cache tags", () => {
    revalidateArticle(article);

    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
      "/noticia/article-1/a-obra-da-orla",
      "/noticias",
    ]);
    expect(revalidateTag).toHaveBeenCalledWith("news-articles-published", "max");
    expect(revalidateTag).toHaveBeenCalledWith("article-article-1", "max");
    expect(updateTag).toHaveBeenCalledWith("news-articles-published");
    expect(updateTag).toHaveBeenCalledWith("news-articles");
    expect(updateTag).toHaveBeenCalledWith("article-article-1");
  });

  test("ages Article lists without touching a public path", () => {
    revalidateArticles();

    expect(revalidateTag).toHaveBeenCalledWith("news-articles", "max");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
