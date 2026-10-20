import { editorialLeadImageUrl } from "@/integrations/public-images/editorial";
import { connection } from "next/server";
import { readPublicBlogArticle } from "@/packages/editorial/publicBlogProduction";
import { articleHeaderMediaIds } from "@/packages/editorial";
import { ArticleReaderView } from "@/features/news/components/ArticleReaderView";
import { ArticleContent, type LegacyArticleView } from "@/features/news/components/ArticleContent";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { JsonLd } from "@/components/JsonLd";
import { resolveArticleSlug } from "@/features/news/articleSlugResolution";
import { articleJsonLdImageUrls, buildNewsArticleJsonLd } from "@/features/news/newsArticleJsonLd";
import { appUrl } from "../../../../../bin/appPorts";
import { createOpenGraph } from "@/lib/socialMetadata";

interface ArticlePageProps {
  params: Promise<{
    id: string;
    slug: string;
  }>;
}

export async function generateMetadata(
  props: ArticlePageProps,
): Promise<Metadata> {
  await connection();
  const { id } = await props.params;
  const exact = await readPublicBlogArticle(id);
  if (exact.kind === "published") {
    const description = exact.content.body.substring(0, 160);
    const exactHeaderMediaIds = articleHeaderMediaIds({ ...exact.content, mediaIds: exact.content.media.map(item => item.id) });
    const images = exact.content.media.filter(item => exactHeaderMediaIds.includes(item.id)).map((item, index) => ({
      url: index === 0
        ? editorialLeadImageUrl(item, `/noticia/${encodeURIComponent(id)}/midias/${encodeURIComponent(item.id)}`)
        : `/noticia/${encodeURIComponent(id)}/midias/${encodeURIComponent(item.id)}`,
      alt: item.alt,
    }));
    return {
      title: `${exact.content.title} - Tudo Macaé`,
      description,
      other: {},
      openGraph: createOpenGraph({
        title: exact.content.title,
        description,
        type: "article",
        url: exact.content.path,
        images,
      }),
      alternates: { canonical: exact.content.path },
    };
  }
  if (exact.kind === "unavailable") {
    return {
      title: "Matéria não encontrada - Tudo Macaé",
      robots: { index: false, follow: false },
    };
  }
  const { article, media } = exact;
  const description = article.body.substring(0, 160);
  const canonicalUrl = `/noticia/${id}/${article.slug}`;
  const socialMedia = article.leadMediaId === undefined
    ? media.filter(item => (article.legacyHeaderMediaIds ?? article.mediaIds).includes(item.id))
    : article.leadMediaId === null ? [] : media.filter(item => item.id === article.leadMediaId);
  const images = socialMedia.map(item => ({
    url: `/noticia/${encodeURIComponent(article.id)}/midias/${encodeURIComponent(item.id)}`,
    alt: item.alt,
  }));

  return {
    title: `${article.title} - Tudo Macaé`,
    description,
    other: {},
    openGraph: createOpenGraph({
      title: article.title,
      description,
      type: "article",
      url: canonicalUrl,
      images,
    }),
    alternates: { canonical: canonicalUrl },
  };
}

export default async function NewsArticlePage(props: ArticlePageProps) {
  return (
    <div className="min-h-screen">
      <main className="
        container mx-auto px-4 py-6
        md:py-8
      "
      >
        <div className="
          mx-auto mb-6 max-w-2xl
          md:mb-8
        "
        >
          <Button
            asChild
            variant="ghost"
            className="
              h-auto min-h-11 max-w-full min-w-0 shrink whitespace-normal
            "
          >
            <Link href="/">
              <ArrowLeft className="mr-2 size-4" />
              Voltar ao início
            </Link>
          </Button>
        </div>
        <Suspense fallback={<Loading />}>
          <DataLoader params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}

/**
 * Only a published article resolves here: a draft reads as unavailable, so it is a 404 like anything that does not
 * exist, and unpublishing puts an article back into exactly that state.
 */
async function DataLoader(props: ArticlePageProps) {
  await connection();
  const { id, slug } = await props.params;

  const exact = await readPublicBlogArticle(id);
  if (exact.kind === "unavailable") notFound();
  if (exact.kind === "published") return renderPublishedArticle(id, slug, exact);
  return renderLegacyArticle(id, slug, exact);
}

function renderLegacyArticle(id: string, slug: string, view: LegacyArticleView) {
  const resolution = resolveArticleSlug(view.article, slug);
  if (resolution.type === "redirect") {
    permanentRedirect(`/noticia/${id}/${resolution.canonicalSlug}`);
  }
  return <ArticleContent view={view} />;
}

type PublishedArticleRead = Extract<
  Awaited<ReturnType<typeof readPublicBlogArticle>>,
  { kind: "published" }
>;

function renderPublishedArticle(id: string, slug: string, exact: PublishedArticleRead) {
  if (exact.content.path !== `/noticia/${id}/${slug}`) permanentRedirect(exact.content.path);
  const mediaUrls = Object.fromEntries(exact.content.media.map(item => [
    item.id,
    `/noticia/${id}/midias/${encodeURIComponent(item.id)}`,
  ]));
  const leadIds = articleHeaderMediaIds({ ...exact.content, mediaIds: exact.content.media.map(item => item.id) });
  const lead = exact.content.media.find(item => leadIds.includes(item.id));
  const leadImageUrl = lead ? editorialLeadImageUrl(lead, mediaUrls[lead.id]!) : undefined;
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN
    ?? appUrl();
  const jsonLd = buildNewsArticleJsonLd({
    article: {
      title: exact.content.title,
      body: exact.content.body,
      publishedAt: exact.publishedAt,
    },
    imageUrls: articleJsonLdImageUrls({
      article: exact.content,
      mediaUrls: lead && leadImageUrl ? { ...mediaUrls, [lead.id]: leadImageUrl } : mediaUrls,
      origin: publicOrigin,
    }),
  });
  return (
    <article className="mx-auto max-w-5xl" data-testid="news-article">
      <JsonLd data={jsonLd} />
      <ArticleReaderView
        {...(leadImageUrl ? { leadImageUrl } : {})}
        content={exact.content}
        sharing={{ id, canonicalPath: exact.content.path }}
        publishedAt={exact.publishedAt}
        {...(exact.updatedAt !== undefined
          ? { updatedAt: exact.updatedAt }
          : {})}
        mediaUrls={mediaUrls}
      />
    </article>
  );
}
