import type { SiteSearchChunk, SiteSearchResult, SiteSearchResultType } from "./siteSearch";

const maximumResults = 10;
const maximumSnippetLength = 200;
const segment = "[^/]+";
/** Public routes only; everything else the crawler reaches is never presented. */
const publicPages: Array<{ type: SiteSearchResultType; pattern: RegExp }> = [
  { type: "business", pattern: new RegExp(`^/negocio/${segment}/(${segment})$`, "u") },
  { type: "ad", pattern: new RegExp(`^/anuncio/${segment}/(?!editar$)(${segment})$`, "u") },
  { type: "category", pattern: new RegExp(`^/categoria/${segment}/(${segment})$`, "u") },
  { type: "subcategory", pattern: new RegExp(`^/categoria/${segment}/${segment}/${segment}/(${segment})$`, "u") },
  { type: "page", pattern: /^\/(negocios|termos-e-condicoes|politica-de-privacidade)$/u },
  { type: "page", pattern: /^\/()$/u },
];
const siteTitleSuffix = /\s*\|\s*Tudo Macaé\s*$/u;
const localitySuffix = /\s+em Macaé$/u;

/**
 * Category pages title themselves "Padarias em Macaé | Restaurantes | Tudo Macaé";
 * results show the Classifieds path "Restaurantes › Padarias".
 */
function presentedTitle(title: string, type: SiteSearchResultType) {
  if (type !== "category" && type !== "subcategory") return title.replace(siteTitleSuffix, "").trim();
  const parts = title.split("|").map(part => part.trim()).filter(part => part && part !== "Tudo Macaé")
    .map(part => part.replace(localitySuffix, ""));
  return parts.reverse().join(" › ");
}

function publicPageOf(key: string, siteOrigin: string) {
  let url: URL;
  try {
    url = new URL(key);
  }
  catch {
    return undefined;
  }
  if (url.origin !== siteOrigin) return undefined;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/u, "") : url.pathname;
  for (const { type, pattern } of publicPages) {
    const match = path.match(pattern);
    if (match) return { type, path, slug: match[1] ?? "" };
  }
  return undefined;
}

function titleFromSlug(slug: string) {
  let words: string;
  try {
    words = decodeURIComponent(slug).replace(/-+/gu, " ").trim();
  }
  catch {
    words = slug;
  }
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Tudo Macaé";
}

/** The crawler stores pages as Markdown; a result shows plain prose. */
function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/[#*_`>|~]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * The crawler opens a page's first chunk with YAML front matter holding its meta
 * description. Streamed pages then show the `Loading` fallback text before the
 * content that static HTML delivers later in the document.
 */
function snippetSourceOf(text: string) {
  const frontMatter = text.match(/^---\n([\s\S]*?)\n---\n?/u);
  const description = frontMatter?.[1]?.match(/^description:\s*(.+)$/mu)?.[1]?.trim();
  if (description) return description;
  const body = frontMatter ? text.slice(frontMatter[0].length) : text;
  return body.replace(/^\s*Carregando\.\.\.\s*$/gmu, "");
}

function snippetOf(text: string) {
  const plain = plainText(snippetSourceOf(text));
  if (plain.length <= maximumSnippetLength) return plain;
  const cut = plain.slice(0, maximumSnippetLength);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export function presentSiteSearchChunks(
  chunks: SiteSearchChunk[],
  siteOrigin: string,
  types?: readonly SiteSearchResultType[],
): SiteSearchResult[] {
  const results: SiteSearchResult[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const page = publicPageOf(chunk.key, siteOrigin);
    if (!page || seen.has(page.path) || (types && !types.includes(page.type))) continue;
    seen.add(page.path);
    const title = chunk.title && presentedTitle(chunk.title, page.type);
    results.push({
      title: title || titleFromSlug(page.slug),
      type: page.type,
      path: page.path,
      snippet: snippetOf(chunk.text),
    });
    if (results.length === maximumResults) break;
  }
  return results;
}
