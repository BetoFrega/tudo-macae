import styles from "@/features/news/components/ArticleReading.module.css";
import { ArticleDisclosure } from "@/features/news/components/ArticleDisclosure";
import { MediaFigure } from "@tudomacae/media/figure";
import { ArticleBodyRenderer } from "@/features/news/components/ArticleBodyRenderer";
import { PublicContentShare } from "@/components/public-content-sharing/PublicContentShare";
import { JsonLd } from "@/components/JsonLd";
import { MediaImage } from "@/integrations/media/MediaImage";
import type { PublicBlogArticle } from "@tudomacae/editorial-blog/publicBlog";
import { CorrectionsList } from "@/features/news/components/CorrectionsList";
import { buildNewsArticleJsonLd } from "@/features/news/newsArticleJsonLd";
import { formatSaoPauloDateTime } from "@tudomacae/civil-time";
import { isExternalWebLink } from "@/lib/externalWebLink";

/** An article without a publication receipt, rendered from its own fields and the Media it references. */
export type LegacyArticleView = Extract<PublicBlogArticle, { kind: "legacy" }>;
type PublishedArticle = LegacyArticleView["article"];
type ArticleMedia = LegacyArticleView["media"];
type StoryFact = LegacyArticleView["story"];
type StorySource = LegacyArticleView["sources"][number];

function selectHeaderMedia(article: PublishedArticle, media: ArticleMedia) {
  if (article.leadMediaId === undefined) {
    const headerIds = article.legacyHeaderMediaIds ?? article.mediaIds;
    return media.filter(item => headerIds.includes(item.id));
  }
  if (article.leadMediaId === null) return [];
  return media.filter(item => item.id === article.leadMediaId);
}

function ArticleMetadata({ publishedAt, story, editorName }: {
  publishedAt: PublishedArticle["publishedAt"];
  story: StoryFact;
  editorName: string | null;
}) {
  if (!publishedAt && !story && !editorName) return null;
  return (
    <div className={styles.metadata}>
      {publishedAt && (
        <p data-testid="news-article-published-at">
          Publicada em
          {" "}
          {formatSaoPauloDateTime(publishedAt)}
        </p>
      )}
      {story && (
        <p data-testid="news-article-occurred-at">
          O fato aconteceu em
          {" "}
          {formatSaoPauloDateTime(story.occurredAt)}
        </p>
      )}
      {editorName && (
        <p data-testid="news-article-editor">
          Editor responsável:
          {" "}
          {editorName}
        </p>
      )}
    </div>
  );
}

function SourceEntry({ source }: { source: StorySource }) {
  const href = source.canonicalUrl || source.url;
  if (!href) return source.name;
  const external = isExternalWebLink(href);
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex min-h-11 items-center underline"
    >
      {source.name}
    </a>
  );
}

function ArticleSources({ sources }: { sources: StorySource[] }) {
  if (sources.length === 0) return null;
  return (
    <section className={styles.supportSection} data-testid="news-article-sources">
      <h2 className="text-sm font-semibold">Fontes</h2>
      <ul className="mt-1 text-sm text-muted-foreground">
        {sources.map(source => (
          <li key={source.id}>
            <SourceEntry source={source} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ArticleContent({ view }: { view: LegacyArticleView }) {
  const { article, media, sources, story, editorName } = view;
  const headerMedia = selectHeaderMedia(article, media);

  const jsonLd = article.publishedAt
    ? buildNewsArticleJsonLd({
        article: { title: article.title, body: article.body, publishedAt: article.publishedAt },
        imageUrls: headerMedia.map(item => `/noticia/${encodeURIComponent(article.id)}/midias/${encodeURIComponent(item.id)}`),
      })
    : null;

  const captionMedia = media.map(item => ({
    id: item.id,
    alt: item.alt,
    caption: item.caption,
    credit: item.credit,
    generated: item.generated === true,
  }));

  return (
    <article className={styles.article} data-testid="news-article">
      {jsonLd && <JsonLd data={jsonLd} />}
      <header className={styles.header}>
        <h1 className={styles.title} data-testid="news-article-title">
          {article.title}
        </h1>

        <ArticleMetadata publishedAt={article.publishedAt} story={story} editorName={editorName} />

        <PublicContentShare
          className={styles.sharing}
          content={{
            kind: "article",
            id: article.id,
            title: article.title,
            canonicalPath: `/noticia/${article.id}/${article.slug}`,
          }}
        />
      </header>

      {headerMedia.map(item => (
        <MediaFigure key={item.id} className={styles.figure} data-testid="news-article-media" caption={item.caption} credit={item.credit}>
          <MediaImage
            url={`/noticia/${encodeURIComponent(article.id)}/midias/${encodeURIComponent(item.id)}`}
            alt={item.alt}
          />
        </MediaFigure>
      ))}

      <div className={styles.body}>
        <ArticleBodyRenderer
          body={article.body}
          externalLinksInNewTab
          media={media.map(item => ({
            id: item.id,
            alt: item.alt,
            caption: item.caption,
            credit: item.credit,
            url: `/noticia/${article.id}/midias/${item.id}`,
          }))}
        />
      </div>

      <ArticleSources sources={sources} />

      <CorrectionsList corrections={article.corrections} />
      <ArticleDisclosure media={captionMedia} />
    </article>
  );
}
