import { readFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { promisify } from "node:util";
import ts from "typescript";

const registryPath = "domain-seams.json";
const retiredRegistryPath = "domain-seams.retired.json";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const approvedLibraries = new Set(["zod", "remark-parse", "unified"]);

function isInfrastructurePath(local) {
  return local.startsWith("../") || /(^|\/)(db|storage|node_modules)(\/|$)|^apps\/|appEnv/.test(local);
}

function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

/** The manifest of the closest package containing `file`, or `{}` when none sits below `root`. */
function nearestManifest(file, root) {
  let scope = dirname(file);
  while (scope !== root && !existsSync(resolve(scope, "package.json"))) scope = dirname(scope);
  return existsSync(resolve(scope, "package.json")) ? readManifest(resolve(scope, "package.json")) : {};
}

/** The manifest of the `packages/*` workspace that owns `local`, or `{}` when it has none. */
function workspaceManifest(local, root) {
  const packageDirectory = /^packages\/[^/]+\//.exec(local)?.[0];
  const manifest = packageDirectory && resolve(root, packageDirectory, "package.json");
  return manifest && existsSync(manifest) ? readManifest(manifest) : {};
}

function declaresDependency(manifest, name) {
  return manifest.name === name || Boolean(manifest.dependencies?.[name]) || Boolean(manifest.devDependencies?.[name]);
}

function isDeclaredWorkspaceDependency({ specifier, file, local, root }) {
  const name = specifier.split("/").slice(0, 2).join("/");
  const sourceManifest = nearestManifest(file, root);
  const targetManifest = workspaceManifest(local, root);
  return targetManifest.name === name && declaresDependency(sourceManifest, name);
}

/** @param {import("typescript").Node} node */
function staticSpecifier(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier.text;
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) return node.argument.literal.text;
  return undefined;
}

/** @param {import("typescript").Node} node */
function isDynamicImportCall(node) {
  return ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === "require"));
}

/** @param {string} entry @param {string} root */
export function inspectDomainImports(entry, root = packageRoot) {
  root = realpathSync(root);
  const errors = [];
  const visited = new Set();
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const options = config.error ? { moduleResolution: ts.ModuleResolutionKind.Bundler } : ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  function visit(file, chain) {
    if (visited.has(file)) return;
    visited.add(file);
    if (!existsSync(file)) {
      errors.push(`Missing protected source: ${file}`);
      return;
    }
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function dependency(specifier) {
      const route = `${chain} -> ${specifier}`;
      if (approvedLibraries.has(specifier)) return;
      const workspaceImport = specifier.startsWith("@tudomacae/");
      if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !workspaceImport) {
        errors.push(`Infrastructure or unapproved dependency: ${route}`);
        return;
      }
      const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (!target) {
        errors.push(`Unresolved dependency: ${route}`);
        return;
      }
      const local = relative(root, realpathSync(target)).replaceAll("\\", "/");
      if (workspaceImport && !isDeclaredWorkspaceDependency({ specifier, file, local, root })) {
        errors.push(`Undeclared or non-workspace dependency: ${route}`);
        return;
      }
      if (isInfrastructurePath(local)) {
        errors.push(`Infrastructure dependency: ${route} (${local})`);
        return;
      }
      visit(target, route);
    }
    function walk(node) {
      const specifier = staticSpecifier(node);
      if (specifier !== undefined) dependency(specifier);
      if (isDynamicImportCall(node)) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) dependency(arg.text);
        else errors.push(`Unresolved dynamic dependency: ${chain}`);
      }
      if (ts.isImportEqualsDeclaration(node)) errors.push(`Unsupported import assignment: ${chain}`);
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  visit(resolve(entry), relative(root, entry));
  return errors;
}

function assertReplacementsFromBase(previous, current) {
  const replaced = current.flatMap(item => item.replaces ?? []);
  const protectedLineage = new Set(previous.flatMap(item => [
    item.id,
    ...(item.replaces ?? []),
  ]));
  if (new Set(replaced).size !== replaced.length) throw new Error("A protected seam can have only one replacement");
  if (replaced.some(id => !protectedLineage.has(id))) throw new Error("A replacement must name a protected seam from the base");
}

function isCompleteEntry(item) {
  return Boolean(item.id && item.entry && item.probe && item.operations?.length);
}

function weakensProtection(before, after) {
  return before.entry !== after.entry
    || before.probe !== after.probe
    || before.factory !== after.factory
    || before.operations.some(operation => !after.operations.includes(operation))
    || (before.replaces ?? []).some(id => !after.replaces?.includes(id));
}

function assertRetirementsDeclared(current, retired) {
  const ids = retired.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("A retired seam can be listed only once");
  for (const item of retired) {
    if (!item.id || !item.reason?.trim()) throw new Error(`Retired seam requires an id and a reason: ${item.id ?? "(missing id)"}`);
    if (current.some(entry => entry.id === item.id)) throw new Error(`Retired seam cannot stay protected: ${item.id}`);
  }
}

function assertSeamPreserved(before, current, retired) {
  const after = current.find(item => item.id === before.id);
  const replacement = current.find(item => item.replaces?.includes(before.id));
  if (replacement && after) {
    throw new Error(`Protected seam cannot coexist with its replacement: ${before.id}`);
  }
  if (!after && !replacement && retired.some(item => item.id === before.id)) return;
  if ((!after && !replacement) || (after && weakensProtection(before, after))) {
    throw new Error(`Protection reduction requires explicit review: ${before.id}`);
  }
}

/** @param {{id:string, entry:string, operations:string[], probe:string, factory?:string, replaces?:string[]}[]} previous @param {{id:string, entry:string, operations:string[], probe:string, factory?:string, replaces?:string[]}[]} current @param {{id:string, reason:string}[]} retired */
export function assertProtectionPreserved(previous, current, retired = []) {
  if (!current.length || new Set(current.map(item => item.id)).size !== current.length) throw new Error("Protection registry must be nonempty and have unique ids");
  assertReplacementsFromBase(previous, current);
  if (!current.every(isCompleteEntry)) throw new Error("Incomplete protection entry");
  assertRetirementsDeclared(current, retired);
  for (const before of previous) assertSeamPreserved(before, current, retired);
}

/** @param {{id:string, entry:string}[]} previous @param {{replaces?:string[]}[]} current @param {string} root */
export function assertReplacedSourcesRetired(previous, current, root = packageRoot) {
  for (const replacement of current) {
    for (const replacedId of replacement.replaces ?? []) {
      const replaced = previous.find(item => item.id === replacedId);
      if (replaced && existsSync(resolve(root, replaced.entry))) {
        throw new Error(
          `Replaced protected source must be retired: ${replaced.id} (${replaced.entry})`,
        );
      }
    }
  }
}

// A retired entry file may stay for unprotected code, such as shared types, but
// its factory and probe must leave the tree.
/** @param {{id:string, entry:string, probe:string, factory?:string}[]} previous @param {{id:string}[]} retired @param {string} root */
export function assertRetiredSourcesRemoved(previous, retired, root = packageRoot) {
  for (const { id } of retired) {
    const seam = previous.find(item => item.id === id);
    if (!seam) continue;
    const entryPath = resolve(root, seam.entry);
    const factoryRemains = existsSync(entryPath)
      && (!seam.factory || new RegExp(`\\b${seam.factory}\\b`).test(readFileSync(entryPath, "utf8")));
    if (factoryRemains || existsSync(resolve(root, seam.probe))) {
      throw new Error(`Retired protected source must leave the tree: ${seam.id} (${seam.entry})`);
    }
  }
}

/** @param {string} entry @param {string} probe @param {{factory?:string, operations?:string[]}} contract */
export function probeDomainEntry(entry, probe, contract = {}) {
  try {
    const [args, options] = probeCommand(entry, probe, contract);
    execFileSync(process.execPath, args, { ...options, stdio: "pipe" });
  }
  catch (error) {
    throw new Error(describeProbeFailure(error));
  }
}

/** probeDomainEntry without blocking. @param {string} entry @param {string} probe @param {{factory?:string, operations?:string[]}} contract */
export async function probeDomainEntryAsync(entry, probe, contract = {}) {
  await promisify(execFile)(process.execPath, ...probeCommand(entry, probe, contract)).catch((error) => {
    // execFile reports the exit code as `code` and a timeout as a SIGKILL (a probe can ignore SIGTERM); describeProbeFailure reads execFileSync's shape.
    const overflow = error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", timedOut = error.killed && !overflow, exit = typeof error.code === "number";
    throw new Error(describeProbeFailure({ message: error.message, stderr: error.stderr, code: timedOut ? "ETIMEDOUT" : overflow ? "ENOBUFS" : exit ? undefined : error.code, status: exit ? error.code : null, signal: timedOut ? null : error.signal }));
  });
}

function probeCommand(entry, probe, contract) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/FIREBASE|GOOGLE|GCLOUD|CREDENTIAL|TOKEN|SECRET|API_KEY/.test(name)));
  return [["--import", "tsx", resolve(packageRoot, "bin/probe-domain-seam.mjs"), pathToFileURL(resolve(entry)).href, pathToFileURL(resolve(probe)).href, JSON.stringify(contract)], { cwd: packageRoot, env, timeout: probeTimeoutMs, killSignal: "SIGKILL" }];
}

const probeTimeoutMs = 15000;
const probeStderrLimit = 2000;

// Node prints an uncaught execFileSync error with its stdout, stderr and output buffers,
// repeating the probe diagnostic. Keep only how the probe ended and a bounded stderr:
// its head carries the exception name and message, its tail the failing frames.
/** @param {{code?:string, signal?:string|null, status?:number|null, stderr?:Buffer|string, message?:string}} error */
export function describeProbeFailure(error) {
  const stderr = String(error.stderr ?? "").trim();
  const half = probeStderrLimit / 2;
  const diagnostic = stderr.length > probeStderrLimit ? `${stderr.slice(0, half)}\n...\n${stderr.slice(-half)}` : stderr;
  const ending = describeProbeEnding(error);
  return diagnostic ? `Probe ${ending}\n${diagnostic}` : `Probe ${ending}`;
}

/** @param {{code?:string, signal?:string|null, status?:number|null, message?:string}} error */
function describeProbeEnding(error) {
  if (error.code === "ETIMEDOUT") return `timed out after ${probeTimeoutMs}ms`;
  // Node sends SIGTERM when a captured stream overflows, so the code must win over the signal.
  if (error.code === "ENOBUFS") return "exceeded the output buffer (stdout or stderr too large)";
  if (error.signal) return `killed by ${error.signal}`;
  if (typeof error.status === "number") return `exited with status ${error.status}`;
  return `could not run: ${error.message}`;
}

export function checkDomainSeams() {
  const current = JSON.parse(readFileSync(resolve(packageRoot, registryPath), "utf8"));
  const retired = JSON.parse(readFileSync(resolve(packageRoot, retiredRegistryPath), "utf8"));
  const base = process.env.DOMAIN_SEAMS_BASE ?? `origin/${process.env.GITHUB_BASE_REF || "main"}`;
  execFileSync("git", ["rev-parse", "--verify", base], { cwd: packageRoot, stdio: "pipe" });
  const files = execFileSync("git", ["ls-tree", "--name-only", base, "--", registryPath], { cwd: packageRoot, encoding: "utf8" });
  const previous = files.trim() ? JSON.parse(execFileSync("git", ["show", `${base}:${registryPath}`], { cwd: packageRoot, encoding: "utf8" })) : [];
  assertProtectionPreserved(previous, current, retired);
  assertReplacedSourcesRetired(previous, current);
  assertRetiredSourcesRemoved(previous, retired);
  return protectDomainSeams(current).then(() => {
    // Success lists no seams: domain-seams.json already names them, and each failure names its own.
    console.log(`Domain seams: ${current.length} protected (${current.reduce((total, item) => total + item.operations.length, 0)} operations)`);
  });
}

/**
 * protectDomainSeam for every seam, with the probes side by side: one at a time they took ~30 s of
 * `npm run lint` for 73 seams, nearly all of it each probe's Node and tsx startup.
 * Rejects with the first failing seam in registry order, as the sequential check did.
 * @param {{id:string, entry:string, operations:string[], probe:string, factory?:string}[]} items @param {string} root
 */
export async function protectDomainSeams(items, root = packageRoot) {
  const failures = items.map(item => domainSeamProblem(item, root)), queue = items.entries();
  const worker = async () => {
    for (const [index, item] of queue) if (!failures[index]) await probeDomainEntryAsync(resolve(root, item.entry), resolve(root, item.probe), { factory: item.factory, operations: item.operations })
      .catch((cause) => { failures[index] = new Error(`Domain seam probe failed: ${item.id}`, { cause }); });
  };
  await Promise.all(Array.from({ length: availableParallelism() }, worker));
  if (failures.some(Boolean)) throw failures.find(Boolean);
}

/** @param {{id:string, entry:string, operations:string[], probe:string, factory?:string}} item @param {string} root */
export function protectDomainSeam(item, root = packageRoot) {
  const problem = domainSeamProblem(item, root);
  if (problem) throw problem;
  try {
    probeDomainEntry(resolve(root, item.entry), resolve(root, item.probe), { factory: item.factory, operations: item.operations });
  }
  catch (error) {
    throw new Error(`Domain seam probe failed: ${item.id}`, { cause: error });
  }
}

/** @param {{id:string, entry:string, factory?:string}} item @param {string} root */
function domainSeamProblem(item, root) {
  const errors = inspectDomainImports(resolve(root, item.entry), root);
  if (errors.length) return new Error(errors.join("\n"));
  if (!item.factory) return new Error(`Missing construction factory: ${item.id}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkDomainSeams();
