export type ArticleSlugResolution
  = | { type: "serve" }
    | { type: "redirect"; canonicalSlug: string };

/**
 * The id resolves the article; the slug is cosmetic. A request whose slug
 * does not match the article's current one redirects to the canonical slug
 * instead of 404ing, so a link survives a title edit.
 */
export function resolveArticleSlug(
  article: { slug: string },
  requestedSlug: string,
): ArticleSlugResolution {
  return requestedSlug === article.slug
    ? { type: "serve" }
    : { type: "redirect", canonicalSlug: article.slug };
}
