import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { activeVersion } from "./deploy-workers-production.mjs";

export const apiWorker = "tudo-macae-api-production";

export function deployedApiVersion(output) {
  const deployments = output.trim().split("\n").map(line => JSON.parse(line))
    .filter(entry => entry.type === "deploy");
  if (deployments.length !== 1 || deployments[0].worker_name !== apiWorker
    || typeof deployments[0].version_id !== "string" || !deployments[0].version_id) {
    throw new Error(`Wrangler did not report one version for ${apiWorker}`);
  }
  return deployments[0].version_id;
}

function wrangler(args) {
  try {
    return execFileSync("./node_modules/.bin/wrangler", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  catch (error) {
    const providerCode = String(error.stderr ?? "").match(/\[code: (\d+)\]/u)?.[1];
    throw new Error(`Wrangler ${args[0]} failed (exit ${error.status ?? "unknown"}${providerCode ? `, code ${providerCode}` : ""})`);
  }
}

// deploy.mjs generates the configuration from the environment and applies each bound database's migrations.
function runDeploy(args, env) {
  execFileSync("pnpm", ["--filter", "@tudomacae/api-worker", "run", "deploy", "production", ...args], {
    env: { ...process.env, ...env }, stdio: "inherit",
  });
}

function releaseSha() {
  const sha = process.env.RELEASE_SHA;
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("RELEASE_SHA must be a full SHA");
  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (!process.env[name]) throw new Error(`${name} is required for API Worker delivery`);
  }
  return sha;
}

function appendStepSummary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line);
}

// The status read can lag the deploy by a few seconds, so the readback retries within
// about 30 s. A lag longer than the budget, or a real rollback, still fails the delivery.
export const apiReadbackTiming = { attempts: 6, retryDelayMs: 5_000 };

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function deployApiWorker({ command = wrangler, deploy = runDeploy, wait = sleep, timing = apiReadbackTiming } = {}) {
  const sha = releaseSha();
  const readActive = () => activeVersion(JSON.parse(command(["deployments", "status", "--name", apiWorker, "--json"])), apiWorker);
  const previous = readActive();
  if (process.env.RUNNER_TEMP) {
    writeFileSync(path.join(process.env.RUNNER_TEMP, "api-worker-recovery.json"), `${JSON.stringify({ sha, worker: apiWorker, previous }, null, 2)}\n`);
  }
  // Migrations run first so the published version never reads a schema it does not have.
  deploy(["--migrations-only"]);
  const directory = mkdtempSync(path.join(tmpdir(), "api-worker-delivery-"));
  try {
    const outputFile = path.join(directory, "deploy.ndjson");
    deploy([], { WRANGLER_OUTPUT_FILE_PATH: outputFile });
    const expected = deployedApiVersion(readFileSync(outputFile, "utf8"));
    let observed = readActive();
    for (let attempt = 2; observed !== expected && attempt <= timing.attempts; attempt += 1) {
      wait(timing.retryDelayMs);
      observed = readActive();
    }
    if (observed !== expected) {
      throw new Error(`Active version differs from the deployed version: ${apiWorker} (last observed ${observed} after ${timing.attempts} attempts)`);
    }
    appendStepSummary(`- ${apiWorker}: ${expected} (main ${sha}; previous ${previous})\n`);
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    deployApiWorker();
  }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
