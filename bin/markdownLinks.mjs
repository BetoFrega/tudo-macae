import path from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";

const markdown = unified().use(remarkParse);

function visit(node, visitor) {
  visitor(node);
  for (const child of node.children ?? []) visit(child, visitor);
}

export function visibleMarkdown(contents) {
  const hidden = [];
  visit(markdown.parse(contents), (node) => {
    if (node.type === "code" || node.type === "html") {
      hidden.push([node.position.start.offset, node.position.end.offset]);
    }
  });
  let visible = contents;
  for (const [start, end] of hidden.reverse()) {
    visible = visible.slice(0, start)
      + visible.slice(start, end).replace(/[^\r\n]/g, " ") + visible.slice(end);
  }
  return visible;
}

/**
 * @param {string} contents
 * @param {{ navigationOnly?: boolean }} options
 * @returns {string[]}
 */
export function internalMarkdownTargets(contents, { navigationOnly = false } = {}) {
  const tree = markdown.parse(contents);
  const targets = [];
  const definitions = new Map();
  visit(tree, (node) => {
    if (node.type !== "definition") return;
    if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    if (!navigationOnly) targets.push(node.url);
  });
  visit(tree, (node) => {
    if (node.type === "link" || (!navigationOnly && node.type === "image")) {
      targets.push(node.url);
    }
    else if (node.type === "linkReference"
      || (!navigationOnly && node.type === "imageReference")) {
      const target = definitions.get(node.identifier);
      if (target) targets.push(target);
    }
  });

  const localTargets = targets.flatMap((rawTarget) => {
    const target = rawTarget.trim();
    if (!target || target.startsWith("#") || target.startsWith("/")
      || /^[a-z][a-z\d+.-]*:/i.test(target)) return [];
    const linkPath = target.split(/[?#]/, 1)[0];
    return linkPath ? [path.posix.normalize(linkPath)] : [];
  });
  return [...new Set(localTargets)];
}
