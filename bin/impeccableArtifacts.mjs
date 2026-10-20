import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const PRODUCTION_SOURCE_EXTENSIONS = new Set([
  ".astro", ".css", ".cjs", ".html", ".js", ".jsx", ".mjs", ".svelte", ".ts", ".tsx", ".vue",
]);
const SCRIPT_SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

const LIVE_RESIDUES = [
  "impeccable-live-start",
  "impeccable-live-end",
  "impeccable-live-ignore-start",
  "impeccable-live-ignore-end",
  "impeccable-live-tanstack",
  "impeccable-live-svelte-start",
  "impeccable-live-svelte-end",
  "impeccable-live-nuxt-plugin",
  "impeccable-variants-start",
  "impeccable-variants-end",
  "impeccable-carbonize-start",
  "impeccable-carbonize-end",
  "impeccable-param-values",
  "data-impeccable-",
  "data-p-*",
  "var(--p-*)",
  "--impeccable-variant-ready",
];

function isProductionSource(name) {
  const segments = name.split("/");
  const extension = path.posix.extname(name);
  return (
    segments[0] === "src"
    && !segments.includes("tests")
    && !/\.(?:spec|test)\.[^.]+$/.test(name)
    && PRODUCTION_SOURCE_EXTENSIONS.has(extension)
  );
}

function isDiscardableImport(specifier) {
  return /(^|\/)\.impeccable(?:\/|$)|(^|\/)\.impeccable-live(?:\/|\.json(?:$|[?#])|$)/.test(specifier);
}

function scriptKind(name) {
  switch (path.posix.extname(name)) {
    case ".tsx": return ts.ScriptKind.TSX;
    case ".jsx": return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs": return ts.ScriptKind.JS;
    default: return ts.ScriptKind.TS;
  }
}

function scriptImportSpecifiers(name, source) {
  const specifiers = new Set();
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, false, scriptKind(name));
  function add(moduleSpecifier) {
    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      specifiers.add(moduleSpecifier.text);
    }
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    }
    else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return specifiers;
}

function cssImportSpecifiers(source) {
  const specifiers = new Set();
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(
    /^\s*@import\s+(?:url\(\s*)?(?:(["'])([^"'\r\n]+)\1|([^\s;)]+))\s*\)?/gm,
  )) specifiers.add(match[2] ?? match[3]);
  return specifiers;
}

function importSpecifiers(name, source) {
  return path.posix.extname(name) === ".css"
    ? cssImportSpecifiers(source)
    : SCRIPT_SOURCE_EXTENSIONS.has(path.posix.extname(name))
      ? scriptImportSpecifiers(name, source)
      : new Set();
}

function liveResidues(source) {
  const residues = [];
  for (const residue of LIVE_RESIDUES) {
    if (residue === "data-p-*") {
      if (/\bdata-p-[A-Za-z0-9_-]+\s*(?:=|\])/.test(source)) residues.push(residue);
      continue;
    }
    if (residue === "var(--p-*)") {
      if (/var\(\s*--p-[A-Za-z0-9_-]+\s*[,)]/.test(source)) residues.push(residue);
      continue;
    }
    if (source.includes(residue)) residues.push(residue);
  }
  return residues;
}

function gitRunner(repositoryRoot) {
  return (args, options = {}) => execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
}

function snapshotEntries(git, staged) {
  const listing = git(staged
    ? ["ls-files", "--stage", "-z"]
    : ["ls-tree", "--full-tree", "-r", "-z", "HEAD"]);
  return listing.split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    const [mode, second, third] = record.slice(0, separator).split(" ");
    if (staged && third !== "0") throw new Error("Resolva os conflitos no índice antes de verificar artefatos.");
    return {
      name: record.slice(separator + 1),
      mode,
      hash: staged ? second : third,
    };
  });
}

function productionSourceFailures(git, entries, snapshot) {
  const failures = [];
  for (const entry of entries.filter(entry => isProductionSource(entry.name))) {
    const source = git(["cat-file", "blob", entry.hash]);
    for (const specifier of importSpecifiers(entry.name, source)) {
      if (!isDiscardableImport(specifier)) continue;
      failures.push(
        `Import de área descartável no ${snapshot}: ${JSON.stringify(entry.name)} `
        + `(${JSON.stringify(specifier)}). Remova a dependência do código de produção; consulte docs/agents/impeccable-artifacts.md.`,
      );
    }
    for (const residue of liveResidues(source)) {
      failures.push(
        `Resíduo do live no ${snapshot}: ${JSON.stringify(entry.name)} `
        + `(${residue}). Encerre a instrumentação sem apagar artefatos; consulte docs/agents/impeccable-artifacts.md.`,
      );
    }
  }
  return failures;
}

async function createPolicyRepository(git, entries, policyRoot) {
  // Commit hooks export repository-local Git variables. The policy repository
  // must not inherit their index, object store or worktree (nor local excludes).
  const policyEnvironment = { ...process.env };
  for (const name of git(["rev-parse", "--local-env-vars"]).trim().split("\n")) {
    delete policyEnvironment[name];
  }
  const policyOptions = { cwd: policyRoot, env: policyEnvironment };
  git(["-c", "init.templateDir=", "init", "--quiet"], policyOptions);

  for (const entry of entries.filter(entry => path.posix.basename(entry.name) === ".gitignore")) {
    // Git never follows symlinked .gitignore files.
    if (entry.mode !== "100644" && entry.mode !== "100755") continue;
    const destination = path.join(policyRoot, entry.name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, git(["cat-file", "blob", entry.hash]));
  }
  return policyOptions;
}

function ignoredArtifactFailures(git, artifacts, policyOptions, snapshot) {
  let matches;
  try {
    matches = git([
      "-c", "core.excludesFile=/dev/null", "check-ignore", "--no-index", "--verbose", "-z", "--stdin",
    ], { ...policyOptions, input: `${artifacts.map(entry => entry.name).join("\0")}\0` });
  }
  catch (error) {
    if (error.status === 1) return [];
    throw error;
  }

  const fields = matches.split("\0");
  const failures = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [source, line, pattern, artifact] = fields.slice(index, index + 4);
    if (pattern.startsWith("!")) continue;
    failures.push(
      `Artefato Impeccable proibido no ${snapshot}: ${JSON.stringify(artifact)} `
      + `(${source}:${line}: ${pattern}). Preserve a cópia local; consulte docs/agents/impeccable-artifacts.md.`,
    );
  }
  return failures;
}

/** Inspect the complete index or HEAD using only that snapshot's ignore policy. */
export async function checkImpeccableArtifacts({ repositoryRoot, staged = false }) {
  const git = gitRunner(repositoryRoot);
  const snapshot = staged ? "índice" : "HEAD";
  let policyRoot;
  try {
    const entries = snapshotEntries(git, staged);
    const sourceFailures = productionSourceFailures(git, entries, snapshot);
    // This bounds the policy's area, not its allowed/forbidden artifact types.
    const artifacts = entries.filter(entry => /(^|\/)\.impeccable(?:\/|$|-live(?:\/|\.json$|$))/.test(entry.name));
    if (artifacts.length === 0) return sourceFailures;

    policyRoot = await mkdtemp(path.join(tmpdir(), "impeccable-ignore-"));
    const policyOptions = await createPolicyRepository(git, entries, policyRoot);
    return [...sourceFailures, ...ignoredArtifactFailures(git, artifacts, policyOptions, snapshot)];
  }
  catch (error) {
    return [`Não foi possível verificar os artefatos Impeccable: ${error.message}`];
  }
  finally {
    // Only disposable policy copies created above are removed, never artifacts.
    if (policyRoot) await rm(policyRoot, { recursive: true, force: true });
  }
}
