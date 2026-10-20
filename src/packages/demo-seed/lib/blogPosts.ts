import { DEMO_PASSWORD, accountEmail } from "./accounts";
import { demoArticles } from "./articleData";
import { timestampDaysBeforeBoot } from "./demoClock";
import { blogAs, fixture, signIn, type DemoBlog } from "./worker";

async function idByTitle(blog: DemoBlog): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await blog.list(cursor);
    for (const post of page.items) ids.set(post.title, post.id);
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

/**
 * Writes the demo Matérias as Blog posts through the API Worker, signed in as the editor. The Blog chooses post IDs, so the title is the stable key:
 * a fixture that outlives a `next dev` restart keeps its posts, and a second run adds none. Every run
 * dates every demo post again, so a run that stopped between saving and dating a post is finished by the next.
 * Corrections stay out because the Blog does not record them.
 */
export async function seedBlogPosts(bootTime: number): Promise<number> {
  const blog = await blogAs(await signIn(accountEmail("editor"), DEMO_PASSWORD));
  const ids = await idByTitle(blog);
  for (const article of demoArticles) {
    const published = article.status === "published";
    const id = ids.get(article.title)
      ?? (await blog.save({ title: article.title, body: article.body, ...(published ? { publish: true } : {}) })).post.id;
    await fixture("/backdate-post", {
      id,
      createdAt: timestampDaysBeforeBoot(bootTime, article.createdDaysAgo),
      ...(published ? { publishedAt: timestampDaysBeforeBoot(bootTime, article.publishedDaysAgo) } : {}),
    });
  }
  return demoArticles.length;
}
