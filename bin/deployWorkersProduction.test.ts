import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { activeVersion, assertRouteSafeConfig, deployedVersion, deployWorkers, probeWorkerContracts, routeSnapshot, workers } from "./deploy-workers-production.mjs";

const version = "12345678-1234-1234-1234-123456789abc";

test("production configs preserve dashboard-managed routes", () => {
  for (const worker of workers) {
    const source = readFileSync(worker.config, "utf8");
    expect(() => assertRouteSafeConfig(source, worker.name)).not.toThrow();
    expect(() => assertRouteSafeConfig(source.replace("\"name\":", "\"routes\": [], \"name\":"), worker.name)).toThrow(/Routes/);
  }
});

test("accepts only the production version emitted by this Wrangler deploy", () => {
  const output = [
    JSON.stringify({ type: "wrangler-session" }),
    JSON.stringify({ type: "deploy", worker_name: workers[0].name,
      wrangler_environment: "production", version_id: version }),
  ].join("\n");
  expect(deployedVersion(output, workers[0].name)).toBe(version);
  expect(deployedVersion(output.replace("\"production\"", "null"), workers[0].name)).toBe(version);
  expect(() => deployedVersion(output, workers[1].name)).toThrow();
  expect(() => deployedVersion(output.replace("production", "staging"), workers[0].name)).toThrow();
});

test("readback requires the exact version at 100 percent", () => {
  expect(activeVersion({ versions: [{ version_id: version, percentage: 100 }] }, workers[0].name)).toBe(version);
  expect(() => activeVersion({ versions: [
    { version_id: version, percentage: 50 }, { version_id: version, percentage: 50 },
  ] }, workers[0].name)).toThrow();
  expect(() => activeVersion({ versions: [] }, workers[0].name)).toThrow();
});

test("route snapshots compare route identity, pattern and owner", () => {
  const routes = [
    { id: "b", pattern: "mcp.tudomacae.com.br/*", script: workers[1].name },
    { id: "a", pattern: "www.tudomacae.com.br/*", script: workers[1].name },
  ];
  expect(routeSnapshot({ success: true, result: routes })).toEqual([...routes].reverse());
  expect(() => routeSnapshot({ success: false, result: routes })).toThrow();
});

test("builds Terms before publishing the edge and reads all active versions without changing routes", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "worker-release-test-"));
  const original = { ...process.env };
  const active = new Map(workers.map(worker => [worker.name, version]));
  const deployed: string[] = [];
  const routes = [{ id: "route-1", pattern: "www.tudomacae.com.br/*", script: workers[1].name }];
  const publish = (worker: typeof workers[number], outputFile: string) => {
    deployed.push(worker.name);
    active.set(worker.name, "abcdefab-cdef-1234-5678-abcdefabcdef");
    writeFileSync(outputFile, JSON.stringify({
      type: "deploy", worker_name: worker.name, wrangler_environment: "production",
      version_id: active.get(worker.name),
    }));
  };
  const command = (args: string[], options?: { env?: Record<string, string> }) => {
    const config = args[args.indexOf("--config") + 1];
    const worker = workers.find(item => item.config === config || (item.build && config === "dist/server/wrangler.json"));
    if (!worker) throw new Error("Unknown Worker fixture");
    if (args[0] === "versions") return JSON.stringify([{ id: version, annotations: { "workers/tag": "older-release" } }]);
    if (args[0] === "deployments") {
      return JSON.stringify({ versions: [{ version_id: active.get(worker.name), percentage: 100 }] });
    }
    publish(worker, options!.env!.WRANGLER_OUTPUT_FILE_PATH);
    return "";
  };
  const build = (_file: string, args: string[], options: { env: Record<string, string> }) => {
    expect(args).toEqual(["build", "--config", "vite.vinext.config.ts", "--logLevel", "warn"]);
    expect(options.env).toMatchObject({ CLOUDFLARE_ENV: "production", WEB_ASSET_RELEASE: "a".repeat(40) });
    return "";
  };
  try {
    Object.assign(process.env, {
      RELEASE_SHA: "a".repeat(40), CLOUDFLARE_API_TOKEN: "fixture",
      CLOUDFLARE_ACCOUNT_ID: "fixture", CLOUDFLARE_ZONE_ID: "fixture",
      RUNNER_TEMP: directory, GITHUB_STEP_SUMMARY: path.join(directory, "summary"),
    });
    await deployWorkers({ command, build,
      generatedConfig: () => ({ name: workers[0].name, targetEnvironment: "production", workers_dev: false, assets: { directory: "../client" } }),
      retainAssets: async () => ({ count: 1, retained: 1 }),
      routes: async () => routes, exists: async () => true, probe: async () => {} });
    expect(deployed).toEqual(workers.map(worker => worker.name));
    expect(JSON.parse(readFileSync(path.join(directory, "workers-recovery.json"), "utf8")).previous)
      .toEqual(Object.fromEntries(workers.map(worker => [worker.name, version])));
    expect(readFileSync(path.join(directory, "summary"), "utf8")).toContain(workers[2].name);
  }
  finally {
    process.env = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("records an absent Terms Worker as a first deployment", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "worker-first-release-test-"));
  const original = { ...process.env };
  const active = new Map(workers.slice(1).map(worker => [worker.name, version]));
  const routes = [{ id: "route-1", pattern: "www.tudomacae.com.br/*", script: workers[1].name }];
  const publish = (worker: typeof workers[number], outputFile: string) => {
    active.set(worker.name, version);
    writeFileSync(outputFile, JSON.stringify({ type: "deploy", worker_name: worker.name,
      wrangler_environment: "production", version_id: version }));
  };
  const command = (args: string[], options?: { env?: Record<string, string> }) => {
    const config = args[args.indexOf("--config") + 1];
    const worker = workers.find(item => item.config === config || (item.build && config === "dist/server/wrangler.json"))!;
    if (args[0] === "deployments") {
      if (!active.has(worker.name)) throw new Error("The Terms Worker has not been deployed");
      return JSON.stringify({ versions: [{ version_id: active.get(worker.name), percentage: 100 }] });
    }
    publish(worker, options!.env!.WRANGLER_OUTPUT_FILE_PATH);
    return "";
  };
  try {
    Object.assign(process.env, { RELEASE_SHA: "a".repeat(40), CLOUDFLARE_API_TOKEN: "fixture",
      CLOUDFLARE_ACCOUNT_ID: "fixture", CLOUDFLARE_ZONE_ID: "fixture", RUNNER_TEMP: directory });
    await deployWorkers({ command, build: () => "",
      generatedConfig: () => ({ name: workers[0].name, targetEnvironment: "production", workers_dev: false, assets: { directory: "../client" } }),
      retainAssets: async ({ previousExists }: { previousExists: boolean }) => {
        expect(previousExists).toBe(false);
        return { count: 1, retained: 0 };
      },
      routes: async () => routes, exists: async () => false, probe: async () => {} });
    expect(JSON.parse(readFileSync(path.join(directory, "workers-recovery.json"), "utf8")).previous[workers[0].name]).toBeNull();
  }
  finally {
    process.env = original;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reuses a tagged route-free Terms bootstrap on its first CI delivery", async () => {
  const original = { ...process.env };
  const sha = "a".repeat(40);
  const active = new Map(workers.map(worker => [worker.name, version]));
  const deployed: string[] = [];
  const routes = [{ id: "route-1", pattern: "www.tudomacae.com.br/*", script: workers[1].name }];
  const command = (args: string[], options?: { env?: Record<string, string> }) => {
    const worker = workers.find(item => item.config === args[args.indexOf("--config") + 1])!;
    if (args[0] === "versions") return JSON.stringify([{ id: version, annotations: { "workers/tag": sha } }]);
    if (args[0] === "deployments") {
      return JSON.stringify({ versions: [{ version_id: active.get(worker.name), percentage: 100 }] });
    }
    deployed.push(worker.name);
    writeFileSync(options!.env!.WRANGLER_OUTPUT_FILE_PATH, JSON.stringify({ type: "deploy", worker_name: worker.name,
      wrangler_environment: "production", version_id: version }));
    return "";
  };
  try {
    Object.assign(process.env, { RELEASE_SHA: sha, CLOUDFLARE_API_TOKEN: "fixture",
      CLOUDFLARE_ACCOUNT_ID: "fixture", CLOUDFLARE_ZONE_ID: "fixture" });
    await deployWorkers({ command,
      build: () => { throw new Error("Terms bootstrap should not rebuild"); },
      retainAssets: async () => { throw new Error("Terms bootstrap should not copy assets"); },
      routes: async () => routes, exists: async () => true, probe: async () => {} });
    expect(deployed).toEqual(workers.slice(1).map(worker => worker.name));
  }
  finally {
    process.env = original;
  }
});

test("post-deploy probes require a live Article sitemap and both identity guards", async () => {
  const articleSitemap = "<urlset><url><loc>https://www.tudomacae.com.br/noticia/id/slug</loc></url></urlset>";
  const assetManifest = Response.json({ schema: 1, assets: [{ path: `/_terms-workers/${"a".repeat(40)}/_next/static/app.js`, sha256: "b".repeat(64) }] }, { headers: { "x-www-origin": "terms-workers" } });
  const request = async (url: string | URL | Request) => String(url).endsWith("/assets-v1.json")
    ? assetManifest.clone()
    : String(url).endsWith("/sitemap.xml")
      ? new Response(articleSitemap, { status: 200, headers: { "x-www-origin": "terms-workers" } })
      : new Response(null, { status: 401 });
  await expect(probeWorkerContracts(request)).resolves.toBeUndefined();
  await expect(probeWorkerContracts(async (url: string | URL | Request) => String(url).endsWith("/assets-v1.json")
    ? assetManifest.clone()
    : String(url).endsWith("/sitemap.xml")
      ? new Response("<urlset></urlset>", { status: 200, headers: { "x-www-origin": "terms-workers" } })
      : new Response(null, { status: 401 }))).rejects.toThrow(/Article URL/);
  await expect(probeWorkerContracts(async (url: string | URL | Request) => String(url).endsWith("/assets-v1.json")
    ? assetManifest.clone()
    : String(url).endsWith("/sitemap.xml")
      ? new Response(articleSitemap, { status: 200, headers: { "x-www-origin": "terms-workers" } })
      : new Response(null, { status: 502 }))).rejects.toThrow(/authentication probe/);
  await expect(probeWorkerContracts(async () => new Response(null, { status: 404 })))
    .rejects.toThrow(/web asset manifest/);
  await expect(probeWorkerContracts(async (url: string | URL | Request) => String(url).endsWith("/assets-v1.json")
    ? assetManifest.clone()
    : String(url).endsWith("/sitemap.xml")
      ? new Response(articleSitemap, { status: 200, headers: { "x-www-origin": "cloud-run" } })
      : new Response(null, { status: 401 }))).rejects.toThrow(/sitemap probe failed/);
});
