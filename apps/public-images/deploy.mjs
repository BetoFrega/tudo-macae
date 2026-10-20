import ts from "typescript";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));

export function deploymentConfiguration(configuration, origin, dryRun = false) {
  if (dryRun && !origin) origin = "https://classifieds.invalid";
  const url = origin && new URL(origin);
  if (!url || url.protocol !== "https:" || url.origin !== origin)
    throw new Error("Public images deployment requires an explicit HTTPS AUTHENTICATION_API_ORIGIN");
  return { ...configuration, main: resolve(root, "index.ts"), env: {
    ...configuration.env, production: { ...configuration.env.production, vars: {
      ...configuration.env.production.vars, CLASSIFIEDS_ORIGIN: origin,
    } },
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = ts.parseConfigFileTextToJson(join(root, "wrangler.jsonc"), await readFile(join(root, "wrangler.jsonc"), "utf8"));
  if (parsed.error) throw new Error("Invalid Worker configuration");
  const configuration = deploymentConfiguration(parsed.config, process.env.AUTHENTICATION_API_ORIGIN, process.argv.includes("--dry-run"));
  const directory = await mkdtemp(join(tmpdir(), "public-images-deployment-"));
  try {
    const path = join(directory, "wrangler.json");
    await writeFile(path, JSON.stringify(configuration));
    execFileSync("wrangler", ["deploy", "--env", "production", "--config", path, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
  }
  finally { await rm(directory, { recursive: true, force: true }); }
}
