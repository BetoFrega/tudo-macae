import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";
import { MediaFigure, MediaVisual } from "@tudomacae/media/figure";
import { isExternalWebLink } from "@/lib/externalWebLink";
import { parseArticleBodyMediaReferences } from "@tudomacae/editorial-blog/articleMediaBody";
import styles from "./ArticleBodyRenderer.module.css";

interface ArticleBodyMedia {
  id: string;
  alt: string;
  caption: string;
  credit: string;
  url: string;
}

type MarkdownNode = Record<string, unknown>;
type MarkdownParent = { children?: MarkdownNode[] };
type MarkdownParagraph = MarkdownNode & { children: MarkdownNode[] };

function canonicalMediaId(node: MarkdownNode) {
  if (node.type !== "image" || typeof node.url !== "string") return undefined;
  return /^media:([^/\s?#]+)$/.exec(node.url)?.[1];
}

function transformInline(node: MarkdownNode, linked = false): MarkdownNode {
  const mediaId = canonicalMediaId(node);
  if (mediaId) return { type: "mediaInline", data: { hName: "article-media-inline", hProperties: { mediaId, creditFocusable: !linked } } };
  if (Array.isArray(node.children)) node.children = node.children.map(child => transformInline(child as MarkdownNode, linked || node.type === "link" || node.type === "linkReference"));
  return node;
}

/** Splits a paragraph around canonical images so each image becomes its own flow block. */
function liftParagraphMedia(paragraph: MarkdownParagraph, output: MarkdownNode[]) {
  let inline: MarkdownNode[] = [];
  const flush = () => {
    if (inline.length) output.push({ ...paragraph, children: inline });
    inline = [];
  };
  for (const child of paragraph.children) {
    const mediaId = canonicalMediaId(child);
    if (!mediaId) {
      inline.push(transformInline(child));
      continue;
    }
    flush();
    output.push({
      type: "mediaBlock",
      data: { hName: "article-media", hProperties: { mediaId } },
    });
  }
  flush();
}

function liftMediaBlocks(parent: MarkdownParent) {
  if (!Array.isArray(parent.children)) return;
  const output: MarkdownNode[] = [];
  for (const node of parent.children) {
    if (node.type === "paragraph" && Array.isArray(node.children)) {
      liftParagraphMedia(node as MarkdownParagraph, output);
      continue;
    }
    if (node.type === "image" || node.type === "tableCell") {
      output.push(transformInline(node));
      continue;
    }
    liftMediaBlocks(node as MarkdownParent);
    output.push(node);
  }
  parent.children = output;
}

/** Lift standalone canonical image nodes into flow blocks in the same Markdown AST. */
function articleMediaFlowPlugin() {
  return (tree: Root) => {
    liftMediaBlocks(tree as unknown as MarkdownParent);
  };
}

/** Renders the complete Markdown document so links, GFM and definitions span in-body figures. */
export function ArticleBodyRenderer({
  body,
  media,
  externalLinksInNewTab = false,
}: {
  body: string;
  media: ArticleBodyMedia[];
  externalLinksInNewTab?: boolean;
}) {
  const knownIds = new Set(parseArticleBodyMediaReferences(body).map(item => item.mediaId));
  const byId = new Map(media.map(item => [item.id, item]));
  const components: Components & Record<string, React.ComponentType<Record<string, unknown>>> = {
    "a": ({ href, children }) => {
      const external = externalLinksInNewTab && isExternalWebLink(href ?? "");
      return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{children}</a>;
    },
    "table": ({ children }) => <div className="overflow-x-auto" role="region" aria-label="Tabela" tabIndex={0}><table>{children}</table></div>,
    "article-media": ({ node: nodeValue }) => {
      const node = nodeValue as { properties?: Record<string, unknown> } | undefined;
      const mediaId = node?.properties?.mediaId;
      const item = typeof mediaId === "string" && knownIds.has(mediaId) ? byId.get(mediaId) : undefined;
      if (!item) return <p role="status">Imagem indisponível na prévia.</p>;
      return (
        <div className="my-6">
          <MediaFigure
            caption={item.caption}
            credit={item.credit}
            className="m-0"
            visualClassName={styles.bodyVisual}
          >
            {/* The loading estimate reserves space; auto lets intrinsic dimensions determine the displayed ratio. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- Original media URLs have no dimension metadata; natural sizing preserves arbitrary formats. */}
            <img
              src={item.url}
              alt={item.alt}
              loading="lazy"
              decoding="async"
              className="m-0 block aspect-[auto_16/9] h-auto w-full"
            />
          </MediaFigure>
        </div>
      );
    },
    "article-media-inline": ({ node: nodeValue }) => {
      const node = nodeValue as { properties?: Record<string, unknown> } | undefined;
      const mediaId = node?.properties?.mediaId;
      const item = typeof mediaId === "string" && knownIds.has(mediaId) ? byId.get(mediaId) : undefined;
      if (!item) return <span role="status">Imagem indisponível na prévia.</span>;
      return (
        <span className="my-1 inline-flex max-w-full flex-col align-middle" role="group" aria-label={item.alt}>
          <MediaVisual credit={item.credit} creditFocusable={node?.properties?.creditFocusable !== false}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Inline canonical media also uses its natural aspect ratio. */}
            <img
              src={item.url}
              alt={item.alt}
              loading="lazy"
              decoding="async"
              width={480}
              height={320}
              className="m-0 block h-auto max-w-full"
            />
          </MediaVisual>
          {item.caption && (
            <span className="block text-sm text-muted-foreground">
              {item.caption}
            </span>
          )}
        </span>
      );
    },
  };

  return (
    <div className="
      prose max-w-none min-w-0 prose-slate
      dark:prose-invert
    "
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, articleMediaFlowPlugin]} components={components}>{body}</ReactMarkdown>
    </div>
  );
}
