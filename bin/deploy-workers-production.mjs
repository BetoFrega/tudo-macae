import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { retainWebAssets, webAssetManifestPath } from "./retain-web-assets.mjs";

import { webAssetPathPattern } from "@tudomacae/www-origin-routing/webAssets";

// The Terms Worker serves the whole app, built from the repository root (ADR 0046).
const webGeneratedConfig = "dist/server/wrangler.json";

export const workers = [
  { name: "tudo-macae-terms-workers", config: "wrangler.web.jsonc", build: true, initial: true },
  { name: "tudo-macae-www-origin-production", config: "apps/www-origin/wrangler.jsonc" },
  { name: "tudo-macae-site-search", config: "apps/site-search/wrangler.jsonc" },
  { name: "tudo-macae-public-article-index", config: "apps/public-article-index/wrangler.jsonc" },
];

function parseWranglerConfig(source, workerName) {
  const parsed = ts.parseConfigFileTextToJson(workerName, source);
  if (parsed.error || !parsed.config || typeof parsed.config !== "object") {
    throw new Error(`Invalid Wrangler configuration: ${workerName}`);
  }
  return parsed.config;
}

function declaresRoutes(scope) {
  return "route" in scope || "routes" in scope;
}

export function assertRouteSafeConfig(source, workerName) {
  const config = parseWranglerConfig(source, workerName);
  const production = config.env?.production;
  if (!production || production.name !== workerName) {
    throw new Error(`Unexpected production Worker name: ${workerName}`);
  }
  for (const scope of [config, production]) {
    if (declaresRoutes(scope)) {
      throw new Error(`Routes must stay outside the Wrangler configuration: ${workerName}`);
    }
  }
  if ((workerName === "tudo-macae-www-origin-production" || workerName === "tudo-macae-terms-workers")
    && production.workers_dev !== false) {
    throw new Error(`${workerName} must keep workers_dev disabled`);
  }
}

export function deployedVersion(output, workerName) {
  const deployments = output.trim().split("\n").map(line => JSON.parse(line))
    .filter(entry => entry.type === "deploy");
  if (deployments.length !== 1 || deployments[0].worker_name !== workerName
    || (workerName === workers[0].name
      ? ![null, undefined, "production"].includes(deployments[0].wrangler_environment)
      : deployments[0].wrangler_environment !== "production")
    || typeof deployments[0].version_id !== "string" || !deployments[0].version_id) {
    throw new Error(`Wrangler did not report one production version for ${workerName}`);
  }
  return deployments[0].version_id;
}

export function activeVersion(status, workerName) {
  if (!Array.isArray(status?.versions) || status.versions.length !== 1
    || status.versions[0].percentage !== 100
    || typeof status.versions[0].version_id !== "string" || !status.versions[0].version_id) {
    throw new Error(`Production is not serving one version at 100%: ${workerName}`);
  }
  return status.versions[0].version_id;
}

export function routeSnapshot(response) {
  if (response?.success !== true || !Array.isArray(response.result)) {
    throw new Error("Could not read Cloudflare Worker routes");
  }
  return response.result.map(({ id, pattern, script }) => ({ id, pattern, script }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function wrangler(args, options = {}) {
  try {
    // Deploying the vinext Terms Worker prints a 1.4 MB module table, past the default 1 MB buffer.
    return execFileSync("./node_modules/.bin/wrangler", args, {
      encoding: "utf8",
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  catch (error) {
    const providerCode = String(error.stderr ?? "").match(/\[code: (\d+)\]/u)?.[1];
    const cause = error.code ?? `exit ${error.status ?? "unknown"}`;
    throw new Error(`Wrangler ${args[0]} failed (${cause}${providerCode ? `, code ${providerCode}` : ""})`);
  }
}

async function readRoutes() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/workers/routes`,
    { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } },
  );
  if (!response.ok) throw new Error(`Cloudflare route read failed: HTTP ${response.status}`);
  return routeSnapshot(await response.json());
}

async function webWorkerExists() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/tudo-macae-terms-workers/subdomain`,
    { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } },
  );
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Cloudflare web Worker read failed: HTTP ${response.status}`);
  return true;
}

function isWebAssetManifest(manifest) {
  return manifest?.schema === 1 && Array.isArray(manifest.assets) && manifest.assets.length > 0
    && manifest.assets.every(entry => typeof entry?.path === "string"
      && webAssetPathPattern.test(entry.path)
      && /^[a-f0-9]{64}$/u.test(entry.sha256));
}

async function probeWebAssetManifest(request) {
  const webAssets = await request(`https://www.tudomacae.com.br${webAssetManifestPath}`, {
    headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15_000),
  });
  if (webAssets.status !== 200 || webAssets.headers.get("x-www-origin") !== "terms-workers") {
    throw new Error(`Public web asset manifest probe failed: HTTP ${webAssets.status}`);
  }
  if (!isWebAssetManifest(await webAssets.json())) {
    throw new Error("Public web asset manifest is invalid");
  }
}

async function probeSitemap(request) {
  const sitemap = await request("https://www.tudomacae.com.br/sitemap.xml", {
    headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(15_000),
  });
  if (sitemap.status !== 200 || sitemap.headers.get("x-www-origin") !== "terms-workers") {
    throw new Error(`Public sitemap probe failed: HTTP ${sitemap.status}`);
  }
  const xml = await sitemap.text();
  if (!xml.includes("<urlset") || !/<loc>https:\/\/www\.tudomacae\.com\.br\/noticia\/[^<]+<\/loc>/u.test(xml)) {
    throw new Error("Public sitemap probe found no canonical Article URL");
  }
}

async function probeAuthenticationGuards(request) {
  for (const worker of workers.filter(({ name }) => name !== "tudo-macae-www-origin-production" && name !== "tudo-macae-terms-workers")) {
    const config = ts.parseConfigFileTextToJson(worker.config, readFileSync(worker.config, "utf8")).config;
    const origin = config.env.production.vars.OIDC_AUDIENCE;
    const response = await request(origin, { method: "POST", signal: AbortSignal.timeout(10_000) });
    if (response.status !== 401) throw new Error(`Worker authentication probe failed: ${worker.name} HTTP ${response.status}`);
  }
}

export async function probeWorkerContracts(request = fetch) {
  await probeWebAssetManifest(request);
  await probeSitemap(request);
  await probeAuthenticationGuards(request);
}

function deliveryDependencies({ command = wrangler, build = (file, args, options) => execFileSync(file, args, options), generatedConfig = () => JSON.parse(readFileSync(webGeneratedConfig, "utf8")), retainAssets = retainWebAssets, routes: getRoutes = readRoutes, exists = webWorkerExists, probe = probeWorkerContracts } = {}) {
  return { command, build, generatedConfig, retainAssets, getRoutes, exists, probe };
}

function appendStepSummary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line);
}

function releaseSha() {
  const sha = process.env.RELEASE_SHA;
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("RELEASE_SHA must be a full SHA");
  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"]) {
    if (!process.env[name]) throw new Error(`${name} is required for Worker delivery`);
  }
  return sha;
}

async function readWwwRoutes(getRoutes) {
  const routes = await getRoutes();
  if (!routes.some(route => route.pattern === "www.tudomacae.com.br/*"
    && route.script === "tudo-macae-www-origin-production")) {
    throw new Error("The existing www route is absent or points to another Worker");
  }
  return routes;
}

async function readPreviousVersions({ command, exists }, sha, readStatus) {
  const firstWebDeployment = !(await exists());
  const previous = Object.fromEntries(workers.map(worker => [worker.name, worker.initial && firstWebDeployment
    ? null
    : activeVersion(readStatus(worker), worker.name)]));
  const versions = firstWebDeployment
    ? []
    : JSON.parse(command([
        "versions", "list", "--config", workers[0].config, "--env", "production", "--json",
      ]));
  if (!Array.isArray(versions)) throw new Error("Could not read web Worker version tags");
  const currentWeb = versions.find(version => version.id === previous[workers[0].name]);
  const reuseWebBootstrap = currentWeb?.annotations?.["workers/tag"] === sha;
  return { firstWebDeployment, previous, reuseWebBootstrap };
}

function assertGeneratedWebConfig(generated, workerName) {
  if (generated.name !== workerName || generated.targetEnvironment !== "production"
    || generated.workers_dev !== false || declaresRoutes(generated)
    || generated.assets?.directory !== "../client") {
    throw new Error("Unexpected generated web Worker configuration");
  }
}

async function buildAndDeployWeb({ dependencies, sha, firstWebDeployment }, worker, outputFile) {
  const { build, generatedConfig, retainAssets, command } = dependencies;
  // A vinext build's module table passes 1.4 MB on stdout and would overflow the default buffer.
  build(path.resolve("node_modules/.bin/vite"), ["build", "--config", "vite.vinext.config.ts", "--logLevel", "warn"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, CLOUDFLARE_ENV: "production", WEB_ASSET_RELEASE: sha },
  });
  // Every deploy names its config; the build's Wrangler redirect would make Wrangler in apps/* refuse theirs.
  rmSync(".wrangler/deploy", { recursive: true, force: true });
  assertGeneratedWebConfig(generatedConfig(), worker.name);
  await retainAssets({
    clientDirectory: "dist/client",
    releaseSha: sha,
    previousOrigin: "https://www.tudomacae.com.br",
    previousExists: !firstWebDeployment,
  });
  command(["deploy", "--config", webGeneratedConfig, "--tag", sha, "--var", `SOURCE_SHA:${sha}`], {
    env: { WRANGLER_OUTPUT_FILE_PATH: outputFile },
  });
}

async function deployWorker(delivery, worker) {
  const { dependencies, sha, previous, reuseWebBootstrap, routes, readStatus, directory } = delivery;
  const outputFile = path.join(directory, `${worker.name}.ndjson`);
  if (worker.build && !reuseWebBootstrap) await buildAndDeployWeb(delivery, worker, outputFile);
  else if (!worker.build) {
    dependencies.command([
      "deploy", "--config", worker.config, "--env", "production", "--tag", sha,
    ], { env: { WRANGLER_OUTPUT_FILE_PATH: outputFile } });
  }
  const expected = worker.build && reuseWebBootstrap
    ? previous[worker.name]
    : deployedVersion(readFileSync(outputFile, "utf8"), worker.name);
  const actual = activeVersion(readStatus(worker), worker.name);
  if (actual !== expected) throw new Error(`Active version differs from the deployed version: ${worker.name}`);
  const currentRoutes = await dependencies.getRoutes();
  if (JSON.stringify(currentRoutes) !== JSON.stringify(routes)) {
    throw new Error(`Worker routes changed during deployment: ${worker.name}`);
  }
  appendStepSummary(`- ${worker.name}: ${actual} (main ${sha})\n`);
}

export async function deployWorkers(overrides) {
  const dependencies = deliveryDependencies(overrides);
  const sha = releaseSha();
  for (const worker of workers) {
    assertRouteSafeConfig(readFileSync(worker.config, "utf8"), worker.name);
  }

  const routes = await readWwwRoutes(dependencies.getRoutes);
  const readStatus = worker => JSON.parse(dependencies.command([
    "deployments", "status", "--config", worker.config, "--env", "production", "--json",
  ]));
  const { firstWebDeployment, previous, reuseWebBootstrap } = await readPreviousVersions(dependencies, sha, readStatus);
  if (process.env.RUNNER_TEMP) {
    writeFileSync(path.join(process.env.RUNNER_TEMP, "workers-recovery.json"), `${JSON.stringify({ sha, previous, routes }, null, 2)}\n`);
  }

  const directory = mkdtempSync(path.join(tmpdir(), "workers-delivery-"));
  const delivery = { dependencies, sha, firstWebDeployment, previous, reuseWebBootstrap, routes, readStatus, directory };
  try {
    for (const worker of workers) await deployWorker(delivery, worker);
    await dependencies.probe();
    appendStepSummary("- Worker probes: public sitemap and both identity guards passed.\n");
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  deployWorkers().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
