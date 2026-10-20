import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { apiWorker, deployApiWorker, deployedApiVersion } from "./deploy-api-worker-production.mjs";

const previous = "11111111-1111-4111-8111-111111111111";
const next = "22222222-2222-4222-8222-222222222222";
const original = { ...process.env };
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "api-worker-delivery-test-"));
  Object.assign(process.env, { RELEASE_SHA: "a".repeat(40), CLOUDFLARE_API_TOKEN: "fixture", CLOUDFLARE_ACCOUNT_ID: "fixture", RUNNER_TEMP: directory });
  delete process.env.GITHUB_STEP_SUMMARY;
});
afterEach(() => {
  process.env = { ...original };
  rmSync(directory, { recursive: true, force: true });
});

// Fakes Wrangler's status read and deploy.mjs; `serving` is what the status read reports after the deploy.
function delivery(serving = next) {
  let active = previous;
  const calls: string[] = [];
  const command = (args: string[]) => {
    calls.push(args.join(" "));
    return JSON.stringify({ versions: [{ version_id: active, percentage: 100 }] });
  };
  const deploy = (args: string[], env?: Record<string, string>) => {
    calls.push(`deploy.mjs ${args.join(" ")}`.trim());
    if (args.length) return;
    writeFileSync(env!.WRANGLER_OUTPUT_FILE_PATH!, JSON.stringify({ type: "deploy", worker_name: apiWorker, version_id: next }));
    active = serving;
  };
  return { calls, run: () => deployApiWorker({ command, deploy }) };
}

test("records the serving version, migrates before publishing and reads back the published version", () => {
  const { calls, run } = delivery();
  run();
  expect(calls).toEqual([
    `deployments status --name ${apiWorker} --json`,
    "deploy.mjs --migrations-only",
    "deploy.mjs",
    `deployments status --name ${apiWorker} --json`,
  ]);
  expect(JSON.parse(readFileSync(path.join(directory, "api-worker-recovery.json"), "utf8")))
    .toEqual({ sha: "a".repeat(40), worker: apiWorker, previous });
});

test("fails when production serves a version other than the one just published", () => {
  const { run } = delivery(previous);
  expect(run).toThrow(/Active version differs/);
});

test.each([["RELEASE_SHA", "main"], ["CLOUDFLARE_API_TOKEN", ""], ["CLOUDFLARE_ACCOUNT_ID", ""]])("refuses to touch production when %s is %j", (name, value) => {
  const { calls, run } = delivery();
  process.env[name] = value;
  expect(run).toThrow();
  expect(calls).toEqual([]);
});

test("accepts only one deploy record for the API Worker", () => {
  const record = { type: "deploy", worker_name: apiWorker, version_id: next };
  expect(deployedApiVersion(`${JSON.stringify({ type: "wrangler-session" })}\n${JSON.stringify(record)}`)).toBe(next);
  expect(() => deployedApiVersion(JSON.stringify({ ...record, worker_name: "tudo-macae-api-qualification" }))).toThrow();
  expect(() => deployedApiVersion(`${JSON.stringify(record)}\n${JSON.stringify(record)}`)).toThrow();
});
