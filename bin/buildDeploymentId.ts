import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUILD_INPUTS = [
  "bin",
  "image-loader.js",
  "next.config.ts",
  "pnpm-lock.yaml",
  "package.json",
  "postcss.config.mjs",
  "public",
  "src",
  "tsconfig.json",
] as const;

const BUILD_ENVIRONMENT = [
  "PUBLIC_APP_ORIGIN",
] as const;
const DEPLOYMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

type BuildEnvironment = Record<string, string | undefined>;

function updatePath(hash: ReturnType<typeof createHash>, root: string, path: string) {
  const entries = readdirSync(path, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      updatePath(hash, root, entryPath);
      continue;
    }
    if (!entry.isFile()) continue;

    hash.update(relative(root, entryPath));
    hash.update("\0");
    hash.update(readFileSync(entryPath));
    hash.update("\0");
  }
}

/**
 * Gives every distinct browser/server build one stable deployment identity.
 * The value is derived during `next build`, so Partial Prerendering shells and
 * the runtime agree even though Cloud Run assigns `K_REVISION` only later.
 */
export function buildDeploymentId(
  root: string | URL,
  environment: BuildEnvironment = process.env,
) {
  const explicit = environment.NEXT_DEPLOYMENT_ID;
  if (explicit !== undefined) {
    if (!DEPLOYMENT_ID.test(explicit)) throw new Error("Missing or invalid deployment identity.");
    return explicit;
  }

  const rootPath = root instanceof URL ? fileURLToPath(root) : root;
  const hash = createHash("sha256");

  for (const input of BUILD_INPUTS) {
    const inputPath = resolve(rootPath, input);
    if (!existsSync(inputPath)) continue;
    if (statSync(inputPath).isDirectory()) {
      updatePath(hash, rootPath, inputPath);
    }
    else {
      hash.update(relative(rootPath, inputPath));
      hash.update("\0");
      hash.update(readFileSync(inputPath));
      hash.update("\0");
    }
  }

  const publicEnvironment = Object.keys(environment)
    .filter(key => key.startsWith("NEXT_PUBLIC_") || BUILD_ENVIRONMENT.includes(
      key as typeof BUILD_ENVIRONMENT[number],
    ))
    .sort();
  for (const key of publicEnvironment) {
    hash.update(key);
    hash.update("\0");
    hash.update(environment[key] ?? "");
    hash.update("\0");
  }

  return `source-${hash.digest("hex").slice(0, 32)}`;
}
