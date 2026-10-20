import { readdir } from "node:fs/promises";
import path from "node:path";
import { exists } from "./agentHarnessFiles.mjs";
import { checkRetiredContextReferences } from "./agentHarnessRetiredContext.mjs";
import { internalMarkdownTargets } from "./markdownLinks.mjs";

async function collectMarkdownFiles(
  currentDirectory,
  files,
  shouldExcludeDirectory = () => false,
) {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      if (shouldExcludeDirectory(entryPath)) return;

      await collectMarkdownFiles(entryPath, files, shouldExcludeDirectory);
    }
    else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }));
}

const NON_OWNED_MARKDOWN_DIRECTORIES = new Set([
  ".git",
  "node_modules",
]);

function isLockedSkillDirectory(relativePath, lockedSkillNames) {
  const pathSegments = relativePath.split(path.sep);
  return (
    pathSegments.length === 3
    && pathSegments[0] === ".agents"
    && pathSegments[1] === "skills"
    && lockedSkillNames.has(pathSegments[2])
  );
}

const CONTEXT_DESTINATION_PREFIXES = [
  ".agents/",
  ".claude/",
  ".codex/",
  "bin/",
  "docs/",
  "node_modules/",
  "src/",
  "tests/",
];
const CONTEXT_ROOT_FILE_PATTERN = /\.(?:c?js|jsonc?|md|mjs|rules|tsx?|ya?ml|toml)$/;
const CONTEXT_POINTER_CUE = /\b(?:abra|consulte|follow|leia|load|open|read|see|siga|veja)\b[^.!?;:]{0,60}$/i;
const ROOT_CONTEXT_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT-MAP.md",
  "mise.toml",
  "skills-lock.json",
]);

function isSkillEntrypoint(relativePath) {
  return /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(
    relativePath.replaceAll(path.sep, "/"),
  );
}

function isNonPathTarget(target) {
  return (
    /[\s*<>]/.test(target)
    || target.startsWith("/")
    || target.startsWith("~")
    || /^[a-z][a-z\d+.-]*:/i.test(target)
  );
}

function hasContextDestinationPrefix(target) {
  return CONTEXT_DESTINATION_PREFIXES.some(prefix => target.startsWith(prefix));
}

function isBasenameUnderDirectory(target, baseDirectory) {
  return (
    baseDirectory !== undefined
    && !target.includes("/")
    && CONTEXT_ROOT_FILE_PATTERN.test(target)
  );
}

function looksLikeContextTarget(target, { hasContextPrefix, isBasenameUnderDeclaredDirectory, hasPointerCue }) {
  return (
    hasContextPrefix
    || ROOT_CONTEXT_FILES.has(target)
    || isBasenameUnderDeclaredDirectory
    || (hasPointerCue && CONTEXT_ROOT_FILE_PATTERN.test(target))
  );
}

function opensDirectoryList(line, match, target) {
  const followingText = line.slice(match.index + match[0].length).trimStart();
  return target.endsWith("/") && followingText.startsWith(":");
}

// Returns the declared destination for one backtick span, or undefined when the
// span is not a context pointer. A `dir/:` span in an inspected file sets
// `scan.baseDirectory` for the basenames that follow until the next blank line.
function inspectBacktickTarget(line, match, scan) {
  const target = match[1].replace(/:\d+$/, "");
  if (isNonPathTarget(target)) return undefined;

  const hasPointerCue = CONTEXT_POINTER_CUE.test(line.slice(0, match.index));
  const hasContextPrefix = hasContextDestinationPrefix(target);
  const isBasenameUnderDeclaredDirectory = isBasenameUnderDirectory(target, scan.baseDirectory);
  if (!looksLikeContextTarget(target, { hasContextPrefix, isBasenameUnderDeclaredDirectory, hasPointerCue })) {
    return undefined;
  }
  if (!scan.inspectEveryTarget && !hasPointerCue) return undefined;

  const resolvedTarget = isBasenameUnderDeclaredDirectory
    ? path.join(scan.baseDirectory, target)
    : target;
  if (
    scan.inspectEveryTarget
    && hasContextPrefix
    && opensDirectoryList(line, match, target)
  ) scan.baseDirectory = target;
  return resolvedTarget;
}

function declaredContextTargets(contents, relativeSourcePath) {
  const withoutFencedCode = contents.replace(/```[\s\S]*?```/g, "");
  const targets = new Set();
  const scan = {
    baseDirectory: undefined,
    inspectEveryTarget: (
      relativeSourcePath === "AGENTS.md" || isSkillEntrypoint(relativeSourcePath)
    ),
  };

  for (const line of withoutFencedCode.split("\n")) {
    if (line.trim() === "") {
      scan.baseDirectory = undefined;
      continue;
    }

    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const resolvedTarget = inspectBacktickTarget(line, match, scan);
      if (resolvedTarget !== undefined) targets.add(resolvedTarget);
    }
  }

  return targets;
}

async function readLockedSkillNames({ contextRoot, failures, readFile }) {
  try {
    const lock = JSON.parse(
      await readFile(path.join(contextRoot, "skills-lock.json"), "utf8"),
    );
    return new Set(Object.keys(lock.skills ?? {}));
  }
  catch (error) {
    if (error.code !== "ENOENT") {
      failures.push(`skills-lock.json is invalid: ${error.message}`);
    }
    return new Set();
  }
}

function declaresContext(relativeSourcePath) {
  return (
    relativeSourcePath === "AGENTS.md"
    || relativeSourcePath.startsWith(`docs${path.sep}`)
    || isSkillEntrypoint(relativeSourcePath)
  );
}

async function contextDestination(contextRoot, sourcePath, target) {
  const rootDestination = path.resolve(contextRoot, target);
  const resolvesFromRoot = (
    hasContextDestinationPrefix(target)
    || ROOT_CONTEXT_FILES.has(target)
    || await exists(rootDestination)
  );
  return resolvesFromRoot
    ? rootDestination
    : path.resolve(path.dirname(sourcePath), target);
}

async function checkMarkdownFilePointers({ contextRoot, failures, readFile }, sourcePath) {
  const contents = await readFile(sourcePath, "utf8");
  for (const target of internalMarkdownTargets(contents)) {
    const destination = path.resolve(path.dirname(sourcePath), target);
    if (await exists(destination)) continue;

    failures.push(
      `${path.relative(contextRoot, sourcePath)} points to missing internal `
      + `destination ${target}`,
    );
  }

  const relativeSourcePath = path.relative(contextRoot, sourcePath);
  if (!declaresContext(relativeSourcePath)) return;

  for (const target of declaredContextTargets(contents, relativeSourcePath)) {
    const destination = await contextDestination(contextRoot, sourcePath, target);
    if (await exists(destination)) continue;

    failures.push(
      `${relativeSourcePath} declares missing context `
      + `destination ${target}`,
    );
  }
}

export async function checkInternalMarkdownPointers(context) {
  const { contextRoot } = context;
  const markdownFiles = [];
  let lockedSkillNames = new Set();
  const agentsFile = path.join(contextRoot, "AGENTS.md");
  if (await exists(agentsFile)) markdownFiles.push(agentsFile);

  const docsDirectory = path.join(contextRoot, "docs");
  if (await exists(docsDirectory)) {
    await collectMarkdownFiles(docsDirectory, markdownFiles);
  }

  const skillsDirectory = path.join(contextRoot, ".agents", "skills");
  if (await exists(skillsDirectory)) {
    lockedSkillNames = await readLockedSkillNames(context);
    await collectMarkdownFiles(
      skillsDirectory,
      markdownFiles,
      directoryPath => isLockedSkillDirectory(
        path.relative(contextRoot, directoryPath),
        lockedSkillNames,
      ),
    );
  }

  for (const sourcePath of markdownFiles) {
    await checkMarkdownFilePointers(context, sourcePath);
  }

  const retirementMarkdownFiles = [];
  await collectMarkdownFiles(
    contextRoot,
    retirementMarkdownFiles,
    (directoryPath) => {
      const relativePath = path.relative(contextRoot, directoryPath);
      return (
        NON_OWNED_MARKDOWN_DIRECTORIES.has(path.basename(directoryPath))
        || isLockedSkillDirectory(relativePath, lockedSkillNames)
      );
    },
  );
  await checkRetiredContextReferences(context, retirementMarkdownFiles);
}
