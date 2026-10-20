import styles from "./ArticleReading.module.css";
import { EditorialImage } from "@/integrations/public-images/EditorialImage";
import { ArticleBodyRenderer } from "./ArticleBodyRenderer";
import type { ArticleReaderContent } from "@tudomacae/editorial-blog/articleReader";
import { formatSaoPauloDateTime } from "@tudomacae/civil-time";
import { PublicContentShare } from "@/components/public-content-sharing/PublicContentShare";
import { isExternalWebLink } from "@/lib/externalWebLink";
import { ArticleDisclosure } from "./ArticleDisclosure";
import { MediaFigure } from "@tudomacae/media/figure";
import { articleHeaderMediaIds } from "@tudomacae/editorial-blog/articleMediaRoles";
import { sourceDatePresentationText } from "@tudomacae/editorial-sourcing/sourceDatePresentation";

interface ArticleReaderViewProps {
  content: ArticleReaderContent;
  mediaUrls: Record<string, string>;
  leadImageUrl?: string;
  publishedAt?: number;
  updatedAt?: number;
  sharing?: { id: string; canonicalPath: string };
}

type ReaderSource = ArticleReaderContent["sources"][number];

function headerMediaIdsOf(content: ArticleReaderContent) {
  return articleHeaderMediaIds({
    mediaIds: content.media.map(item => item.id),
    ...(content.leadMediaId !== undefined ? { leadMediaId: content.leadMediaId } : {}),
    ...(content.legacyHeaderMediaIds !== undefined
      ? { legacyHeaderMediaIds: content.legacyHeaderMediaIds }
      : {}),
  });
}

function ReaderMetadata({ publishedAt, updatedAt, editorName }: {
  publishedAt: number | undefined;
  updatedAt: number | undefined;
  editorName: ArticleReaderContent["editorName"];
}) {
  if (publishedAt === undefined && updatedAt === undefined && !editorName) return null;
  return (
    <div className={styles.metadata}>
      {publishedAt !== undefined && (
        <span data-testid="news-article-published-at">
          Publicada em
          {" "}
          <time dateTime={new Date(publishedAt).toISOString()}>{formatSaoPauloDateTime(publishedAt)}</time>
        </span>
      )}
      {updatedAt !== undefined && (
        <span data-testid="news-article-updated-at">
          Atualizada em
          {" "}
          <time dateTime={new Date(updatedAt).toISOString()}>{formatSaoPauloDateTime(updatedAt)}</time>
        </span>
      )}
      {editorName && (
        <span data-testid="news-article-editor">
          Editor responsável:
          {" "}
          {editorName}
        </span>
      )}
    </div>
  );
}

function ReaderSourceLink({ source }: { source: ReaderSource }) {
  if (!source.url) return source.name;
  const external = isExternalWebLink(source.url);
  return (
    <a
      href={source.url}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex min-h-11 items-center text-sm underline"
    >
      {source.name}
    </a>
  );
}

function ReaderSourceEntry({ source }: { source: ReaderSource }) {
  const datePresentation = sourceDatePresentationText(source);
  return (
    <>
      <ReaderSourceLink source={source} />
      {datePresentation && (
        <p className="text-xs text-muted-foreground">{datePresentation}</p>
      )}
    </>
  );
}

function ReaderCorrections({ corrections }: { corrections: ArticleReaderContent["corrections"] }) {
  if (!corrections?.length) return null;
  return (
    <section aria-label="Retificações" className="border-t pt-4" data-testid="news-article-corrections">
      <h2>Retificações</h2>
      {corrections.map((item, index) => (
        <p key={index}>
          {formatSaoPauloDateTime(item.createdAt)}
          :
          {" "}
          {item.summary}
        </p>
      ))}
    </section>
  );
}

export function ArticleReaderView({
  content,
  mediaUrls,
  leadImageUrl,
  publishedAt,
  updatedAt,
  sharing,
}: ArticleReaderViewProps) {
  const headerMediaIds = headerMediaIdsOf(content);

  return (
    <div className={styles.article}>
      <header className={styles.header}>
        <h1 className={styles.title}>{content.title}</h1>
        <ReaderMetadata publishedAt={publishedAt} updatedAt={updatedAt} editorName={content.editorName} />
        {sharing && (
          <PublicContentShare
            className={styles.sharing}
            content={{
              kind: "article",
              id: sharing.id,
              title: content.title,
              canonicalPath: sharing.canonicalPath,
            }}
          />
        )}
      </header>
      {content.media.filter(item => headerMediaIds.includes(item.id)).map((item, index) => (
        <MediaFigure
          key={item.id}
          className={styles.figure}
          caption={item.caption}
          credit={mediaUrls[item.id] ? item.credit : undefined}
        >
          {mediaUrls[item.id] && (
            <EditorialImage
              src={index === 0 && leadImageUrl ? leadImageUrl : mediaUrls[item.id]}
              alt={item.alt}
              width={960}
              height={640}
              sizes="(min-width: 1024px) 960px, 100vw"
              unoptimized
              referrerPolicy="no-referrer"
              className={styles.image}
              loading={index === 0 ? "eager" : "lazy"}
            />
          )}
        </MediaFigure>
      ))}
      <div className={styles.body}>
        <ArticleBodyRenderer body={content.body} externalLinksInNewTab media={content.media.flatMap(item => mediaUrls[item.id] ? [{ ...item, url: mediaUrls[item.id]! }] : [])} />
      </div>
      <section
        aria-label="Fontes da Matéria"
        className={styles.supportSection}
      >
        <h2 className="text-sm font-semibold">Fontes</h2>
        <ul className="space-y-1">
          {content.sources.map((source, index) => (
            <li key={`${source.name}-${source.url ?? index}-${index}`}>
              <ReaderSourceEntry source={source} />
            </li>
          ))}
        </ul>
      </section>
      <ReaderCorrections corrections={content.corrections} />
      <ArticleDisclosure media={content.media} {...(content.assisted !== undefined ? { assisted: content.assisted } : {})} />
    </div>
  );
}
