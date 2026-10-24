import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { deployWorkers, workers } from "./deploy-workers-production.mjs";

const sha = "a".repeat(40);
const previousVersion = "11111111-1111-1111-1111-111111111111";
const newVersion = "22222222-2222-2222-2222-222222222222";
const web = workers[0].name;

type Render = (version: string | undefined, path: string, init?: RequestInit) => Response;

const page = (version: string | undefined) => new Response("<!DOCTYPE html><html><body>ok</body></html>", {
  status: 200, headers: { "x-www-origin": "terms-workers", ...(version ? { "x-terms-worker-version": version } : {}) },
});
const unavailable = () => new Response(null, { status: 502, headers: { "x-www-origin": "terms-workers" } });
/** Sends the status and the head of the document, then never finishes the body. */
const stalled = (version: string) => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("<!DOCTYPE html><html><body>"));
  },
}), { status: 200, headers: { "x-terms-worker-version": version } });
const brokenNewVersion: Render = version => version === newVersion ? unavailable() : page(version);

async function deliver({ render, firstDelivery = false, rollbackRefused = false }: { render: Render; firstDelivery?: boolean; rollbackRefused?: boolean }) {
  const directory = mkdtempSync(path.join(tmpdir(), "web-page-gate-test-"));
  const original = { ...process.env };
  const active = new Map(workers.filter(worker => !(firstDelivery && worker.build)).map(worker => [worker.name, previousVersion]));
  const commands: string[][] = [];
  const published: string[] = [];
  const requests: { path: string; init: RequestInit | undefined }[] = [];
  const command = (args: string[], options?: { env?: Record<string, string> }) => {
    commands.push(args);
    if (args[0] === "rollback") {
      if (rollbackRefused) throw new Error("Wrangler rollback failed (exit 1, code 10211)");
      active.set(args[args.indexOf("--name") + 1], args[1]);
      return "";
    }
    const config = args[args.indexOf("--config") + 1];
    const worker = workers.find(item => item.config === config || (item.build && config === "dist/server/wrangler.json"))!;
    if (args[0] === "versions") return JSON.stringify([{ id: previousVersion, annotations: { "workers/tag": "older-release" } }]);
    if (args[0] === "deployments") {
      if (!active.has(worker.name)) throw new Error("Wrangler deployments failed (exit 1)");
      return JSON.stringify({ versions: [{ version_id: active.get(worker.name), percentage: 100 }] });
    }
    published.push(worker.name);
    active.set(worker.name, newVersion);
    writeFileSync(options!.env!.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: "deploy", worker_name: worker.name,
      wrangler_environment: "production", version_id: newVersion }));
    return "";
  };
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    const { pathname } = new URL(String(url));
    requests.push({ path: pathname, init });
    return render(active.get(web), pathname, init);
  };
  Object.assign(process.env, { RELEASE_SHA: sha, CLOUDFLARE_API_TOKEN: "fixture", CLOUDFLARE_ACCOUNT_ID: "fixture",
    CLOUDFLARE_ZONE_ID: "fixture", RUNNER_TEMP: directory, GITHUB_STEP_SUMMARY: path.join(directory, "summary") });
  try {
    const error = await deployWorkers({ command, build: () => "",
      generatedConfig: () => ({ name: web, targetEnvironment: "production", workers_dev: false, assets: { directory: "../client" } }),
      retainAssets: async () => ({ count: 1, retained: 1 }),
      routes: async () => [{ id: "route-1", pattern: "www.tudomacae.com.br/*", script: workers[1].name }],
      exists: async () => !firstDelivery, probe: async () => {},
      pageProbe: { request, wait: async () => {}, timing: { retries: 2, retryDelayMs: 0, responseTimeoutMs: 50 } },
    }).then(() => undefined, (failure: Error) => failure);
    const summary = path.join(directory, "summary");
    return {
      error, commands, published, requests, served: active.get(web),
      rollbacks: commands.filter(args => args[0] === "rollback"),
      recovery: JSON.parse(readFileSync(path.join(directory, "workers-recovery.json"), "utf8")),
      summary: existsSync(summary) ? readFileSync(summary, "utf8") : "",
    };
  }
  finally {
    process.env = original;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a web Worker that renders every probed page lets the other Workers publish", async () => {
  const result = await deliver({ render: page });
  expect(result.error).toBeUndefined();
  expect(result.published).toEqual(workers.map(worker => worker.name));
  expect(result.rollbacks).toEqual([]);
  expect(result.recovery.webRollback).toBeUndefined();
  expect(result.requests.map(({ path }) => path)).toEqual(["/", "/termos-e-condicoes", "/noticias"]);
  for (const { init } of result.requests) {
    expect(new Headers(init?.headers).get("cache-control")).toBe("no-cache");
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  }
});

test("pages still answered by the previous version are retried until the new version answers", async () => {
  let calls = 0;
  const result = await deliver({ render: (version) => {
    calls += 1;
    return page(calls === 1 ? previousVersion : version);
  } });
  expect(result.error).toBeUndefined();
  expect(result.published).toEqual(workers.map(worker => worker.name));
});

test("a failing web Worker is rolled back before any other Worker publishes and the delivery fails", async () => {
  const result = await deliver({ render: brokenNewVersion });
  expect(result.error?.message).toMatch(/Web page probe failed: GET \/: HTTP 502\. Rolled back .*; \/ renders again/);
  expect(result.published).toEqual([web]);
  expect(result.served).toBe(previousVersion);
  expect(result.rollbacks).toEqual([["rollback", previousVersion, "--name", web, "--message", expect.stringMatching(/^Automatic rollback: release a{12} /)]]);
  expect(result.rollbacks[0][5].length).toBeLessThanOrEqual(100);
  expect(result.recovery.previous[web]).toBe(previousVersion);
  expect(result.recovery.webRollback).toEqual({ from: newVersion, to: previousVersion, outcome: "restored",
    reason: "Web page probe failed: GET /: HTTP 502" });
  expect(result.summary).toContain(`rolled back to ${previousVersion}`);
});

test("a 200 whose body stops before the document ends counts as a failure", async () => {
  const result = await deliver({ render: version => version === newVersion ? stalled(version) : page(version) });
  expect(result.error?.message).toMatch(/GET \/: no complete response within 50 ms\. Rolled back/);
  expect(result.recovery.webRollback.outcome).toBe("restored");
  expect(result.published).toEqual([web]);
});

test("a refused rollback fails once with the manual recovery command", async () => {
  const result = await deliver({ render: brokenNewVersion, rollbackRefused: true });
  expect(result.error?.message).toContain(`npx wrangler rollback '${previousVersion}' --name ${web} --message 'Restore previous production version'`);
  expect(result.error?.message).toMatch(/code 10211/);
  expect(result.error?.message).toMatch(/DataCache Durable Object/);
  expect(result.rollbacks).toHaveLength(1);
  expect(result.published).toEqual([web]);
  expect(result.recovery.webRollback).toMatchObject({ from: newVersion, to: previousVersion, outcome: "rollback-failed" });
});

test("a first delivery has no version to roll back to and names the manual recovery", async () => {
  const result = await deliver({ render: brokenNewVersion, firstDelivery: true });
  expect(result.error?.message).toContain(`npx wrangler versions list --name ${web}`);
  expect(result.rollbacks).toEqual([]);
  expect(result.published).toEqual([web]);
  expect(result.recovery.webRollback).toMatchObject({ from: newVersion, to: null, outcome: "not-attempted" });
});

test("a rollback whose previous version also fails is reported as unverified", async () => {
  const result = await deliver({ render: unavailable });
  expect(result.error?.message).toMatch(/Rolled back .* which also fails: Web page probe failed: GET \/: HTTP 502/);
  expect(result.served).toBe(previousVersion);
  expect(result.recovery.webRollback.outcome).toBe("restored-unverified");
});

test("a page without the web Worker version stamp never passes", async () => {
  const result = await deliver({ render: version => version === newVersion ? page(undefined) : page(version) });
  expect(result.error?.message).toMatch(/GET \/: served no web Worker version/);
  expect(result.recovery.webRollback.outcome).toBe("restored");
});
