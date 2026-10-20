import type { MetadataRoute } from "next";
import { CANONICAL_APP_ORIGIN } from "../../bin/appOrigin";
import { getCategories } from "@/features/categories/actions/getCategories";
import { listSitemapArticles } from "@/packages/editorial/articleSitemapProduction";
import { listSitemapBusinessesUseCase } from "@/packages/classifieds-api";
import { businessCanonicalPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { connection } from "next/server";

function absolute(path: string) {
  return new URL(path, CANONICAL_APP_ORIGIN).href;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [categories, articles, businesses] = await Promise.all([
    getCategories(),
    listSitemapArticles(),
    listSitemapBusinessesUseCase(),
  ]);
  const categoryRoutes = categories
    .filter(category => category.isActive)
    .flatMap(category => [
      `/categoria/${category.id}/${category.slug}`,
      ...category.subcategories
        .filter(subcategory => subcategory.isActive)
        .map(subcategory =>
          `/categoria/${category.id}/${category.slug}/${subcategory.id}/${subcategory.slug}`),
    ]);
  const paths = [
    "/",
    "/noticias",
    "/negocios",
    ...categoryRoutes,
    ...articles.map(article => `/noticia/${article.id}/${article.slug}`),
    ...businesses.map(businessCanonicalPath),
  ];
  return [
    ...paths.map(path => ({ url: absolute(path) })),
  ];
}
