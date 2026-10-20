import { readFile as readFileFromFileSystem, readdir } from "node:fs/promises";
import path from "node:path";
import { internalMarkdownTargets, visibleMarkdown } from "./markdownLinks.mjs";

const ADR_STATUSES = new Set([
  "proposed",
  "accepted",
  "partially-superseded",
  "superseded",
  "historical",
]);

function isDecisionDate(value) {
  if (value === "unknown") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readRecordEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  }
  catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function checkRecordIndex({ directory, files, readFile, failures }) {
  try {
    const index = await readFile(path.join(directory, "README.md"), "utf8");
    const indexed = new Set(internalMarkdownTargets(index, { navigationOnly: true })
      .map(target => path.resolve(directory, target)));
    const records = new Set(files.map(file => path.resolve(directory, file.name)));
    for (const file of records) {
      if (!indexed.has(file)) failures.push(`docs/adr/README.md must link to ${path.basename(file)}`);
    }
    for (const target of indexed) {
      if (path.dirname(target) === directory && /^\d{4}-.+\.md$/.test(path.basename(target))
        && !records.has(target)) failures.push(`docs/adr/README.md has stale record ${path.basename(target)}`);
    }
  }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    failures.push("docs/adr/README.md is required for ADR discovery");
  }
}

function parseMetadata(headerBody, source, failures) {
  const metadata = new Map();
  for (const line of headerBody.split(/\r?\n/)) {
    const field = line.match(/^(record|id|status|decided):\s*(.*?)\s*$/);
    if (!field) {
      failures.push(`${source} has unsupported metadata: ${line}`);
      continue;
    }
    const [, name, raw] = field;
    if (metadata.has(name)) failures.push(`${source} repeats metadata ${name}`);
    metadata.set(name, raw.replace(/^(["'])(.*)\1$/, "$2"));
  }
  for (const field of ["record", "id", "status", "decided"]) {
    if (!metadata.get(field)) failures.push(`${source} requires metadata ${field}`);
  }
  return metadata;
}

function checkRecordIdentity({ source, fileName, id, body, metadata, failures }) {
  if (!/^\d{4}$/.test(id) || id !== fileName.slice(0, 4)) {
    failures.push(`${source} metadata id must match its four-digit filename prefix`);
  }
  const firstHeading = body.match(/^# (.+)$/m);
  const title = firstHeading?.[1].match(/^(\d+)\. .+$/);
  if (!title || Number(title[1]) !== Number(id)) {
    failures.push(`${source} title must identify ADR ${id}`);
  }
  if (/^## Status[ \t]*#*[ \t]*$/m.test(body)
    || /^Date:[ \t]+\d{4}-\d{2}-\d{2}(?:[ \t]*\.[ \t]*Amended:[ \t]+\d{4}-\d{2}-\d{2}\.)?[ \t]*$/m.test(body)) {
    failures.push(`${source} must keep status and decision date only in metadata`);
  }
  if (!isDecisionDate(metadata.get("decided") ?? "")) {
    failures.push(`${source} decided must be a calendar date or explicit unknown`);
  }
}

function checkCanonicalRecord({ source, id, status, canonicalIds, failures }) {
  if (!ADR_STATUSES.has(status)) failures.push(`${source} has invalid architectural status ${status}`);
  if (canonicalIds.has(id)) {
    failures.push(`${source} duplicates canonical ADR id ${id} from ${canonicalIds.get(id)}`);
  }
  else canonicalIds.set(id, source);
}

function isInsideRepository(contextRoot, target) {
  const relative = path.relative(contextRoot, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

function checkPointerRecord({ source, status, body, sourcePath, directory, contextRoot, pointerDestinations, failures }) {
  if (status !== "transferred") failures.push(`${source} pointer status must be transferred`);
  const destinations = internalMarkdownTargets(body, { navigationOnly: true })
    .filter(target => target.endsWith(".md"))
    .map(target => path.resolve(directory, target))
    .filter((target) => {
      if (!isInsideRepository(contextRoot, target)) {
        failures.push(`${source} pointer destination must stay inside the repository`);
        return false;
      }
      return target !== sourcePath;
    });
  pointerDestinations.set(sourcePath, destinations);
  if (!destinations.length) failures.push(`${source} pointer requires a local Markdown destination other than itself`);
}

async function checkRecord(file, context) {
  const { directory, readFile, failures } = context;
  const source = `docs/adr/${file.name}`;
  if (!/^\d{4}-.+\.md$/.test(file.name)) {
    failures.push(`${source} requires a four-digit ADR filename prefix`);
    return;
  }
  const contents = await readFile(path.join(directory, file.name), "utf8");
  const withoutLeadingComments = contents.replace(/^(?:\s*<!--[\s\S]*?-->\s*)*/, "");
  const header = withoutLeadingComments.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!header) {
    failures.push(`${source} requires ADR metadata`);
    return;
  }

  const metadata = parseMetadata(header[1], source, failures);
  const id = metadata.get("id") ?? "";
  const record = metadata.get("record");
  const status = metadata.get("status");
  const body = visibleMarkdown(withoutLeadingComments.slice(header[0].length));
  checkRecordIdentity({ source, fileName: file.name, id, body, metadata, failures });

  if (record === "adr") checkCanonicalRecord({ ...context, source, id, status });
  else if (record === "pointer") {
    checkPointerRecord({ ...context, source, status, body, sourcePath: path.resolve(directory, file.name) });
  }
  else failures.push(`${source} record must be adr or pointer`);
}

function checkPointerChains(pointerDestinations, failures) {
  function reachesCanonicalDestination(source, visited = new Set()) {
    if (visited.has(source)) return false;
    const next = new Set([...visited, source]);
    return pointerDestinations.get(source).some(target => !pointerDestinations.has(target)
      || reachesCanonicalDestination(target, next));
  }
  for (const [source, destinations] of pointerDestinations) {
    if (destinations.length && !reachesCanonicalDestination(source)) {
      failures.push(`docs/adr/${path.basename(source)} pointer must reach a non-pointer destination`);
    }
  }
}

/**
 * @param {{ contextRoot: string, readFile?: typeof readFileFromFileSystem }} input
 * @returns {Promise<string[]>}
 */
export async function checkArchitectureRecords({
  contextRoot,
  readFile = readFileFromFileSystem,
}) {
  const directory = path.join(contextRoot, "docs", "adr");
  const entries = await readRecordEntries(directory);

  const failures = [];
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith(".md")
    && !["README.md", "TEMPLATE.md"].includes(entry.name));
  if (files.length) await checkRecordIndex({ directory, files, readFile, failures });

  const context = {
    contextRoot, directory, readFile, failures, canonicalIds: new Map(), pointerDestinations: new Map(),
  };
  for (const file of files.sort((left, right) => left.name.localeCompare(right.name))) {
    await checkRecord(file, context);
  }
  checkPointerChains(context.pointerDestinations, failures);

  return failures;
}
