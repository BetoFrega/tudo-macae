// Gera o `PRODUCT.md` que o Impeccable lê a partir da página "Visão de produto"
// no Notion, a única fonte do conteúdo. O arquivo gerado fica fora do Git.
// Requer `NOTION_TOKEN` de uma integração com acesso à página; o valor nunca é
// impresso.
import { realpathSync, writeFileSync } from "node:fs";

export const PRODUCT_PAGE_ID = "3ff84301-eab3-814e-9740-df573046a187";
export const PRODUCT_SCHEMA_MARKER = "<!-- impeccable:product-schema 1 -->";

const NOTION_VERSION = "2022-06-28";

function renderRichText(items) {
  return items.map((item) => {
    let text = item.plain_text;
    if (item.annotations?.code) text = `\`${text}\``;
    if (item.annotations?.bold) text = `**${text}**`;
    if (item.annotations?.italic) text = `*${text}*`;
    if (item.href && !item.href.startsWith("/")) text = `[${text}](${item.href})`;
    return text;
  }).join("");
}

/**
 * The page opens with a callout addressed to this script, and everything from
 * the first divider on documents the page itself; neither belongs in the file.
 */
export function renderProductMarkdown(blocks) {
  const end = blocks.findIndex(block => block.type === "divider");
  const body = (end === -1 ? blocks : blocks.slice(0, end)).filter(block => block.type !== "callout");
  const lines = ["# Product", "", PRODUCT_SCHEMA_MARKER, ""];
  let numbered = 0;
  body.forEach((block, index) => {
    numbered = block.type === "numbered_list_item" ? numbered + 1 : 0;
    const render = BLOCK_RENDERERS[block.type];
    if (!render) throw new Error(`Unsupported Notion block type in the product page: ${block.type}`);
    lines.push(...render(renderRichText(block[block.type].rich_text), numbered));
    const endsList = block.type.endsWith("list_item") && body[index + 1]?.type !== block.type;
    if (endsList) lines.push("");
  });
  return `${lines.join("\n").trimEnd()}\n`;
}

const BLOCK_RENDERERS = {
  heading_1: text => [`# ${text}`, ""],
  heading_2: text => [`## ${text}`, ""],
  heading_3: text => [`### ${text}`, ""],
  paragraph: text => (text ? [text, ""] : []),
  bulleted_list_item: text => [`- ${text}`],
  numbered_list_item: (text, number) => [`${number}. ${text}`],
};

async function fetchBlocks(pageId, token) {
  const blocks = [];
  let cursor;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    });
    if (!response.ok) throw new Error(`Notion answered ${response.status} for the product page`);
    const page = await response.json();
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === import.meta.filename;
  }
  catch {
    return false;
  }
}

if (invokedDirectly()) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error("Defina NOTION_TOKEN com uma integração do Notion que leia a página Visão de produto.");
    process.exit(1);
  }
  writeFileSync("PRODUCT.md", renderProductMarkdown(await fetchBlocks(PRODUCT_PAGE_ID, token)));
  console.log("PRODUCT.md gerado a partir do Notion.");
}
