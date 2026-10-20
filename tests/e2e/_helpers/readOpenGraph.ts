const HTML_ENTITIES = {
  "&quot;": "\"",
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
} as const;

function decodeHtmlAttribute(value: string): string {
  return Object.entries(HTML_ENTITIES).reduce(
    (decoded, [entity, character]) => decoded.replaceAll(entity, character),
    value,
  );
}

export function readOpenGraph(html: string): Record<string, string> {
  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) throw new Error("Response did not contain a complete head.");

  return Object.fromEntries(
    Array.from(
      html.slice(0, headEnd).matchAll(
        /<meta property="(og:[^"]+)" content="([^"]*)"/g,
      ),
      ([, property, content]) => [property, decodeHtmlAttribute(content)],
    ),
  );
}
