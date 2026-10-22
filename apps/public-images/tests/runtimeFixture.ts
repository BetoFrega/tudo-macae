import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { Miniflare, type Request as MiniflareRequest } from "miniflare";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "public-image-worker-"));
export let runtime: Miniflare;
export let flagRequests = 0;
export let originRequests = 0;
export let boundOriginRequests = 0;
const originAttempts = new Map<string, number>();
export const retiredImageSuffixes = new Set<string>();
export const editorialRequestIds: string[] = [];
export const runtimeLogs: string[] = [];
let bundle: { name: string; contents: string };
const runtimeConfig = { cache: { enabled: true }, compatibilityDate: "2026-09-19", compatibilityFlags: ["nodejs_compat"] };
const publicVars = {
  EDITORIAL_ORIGIN: { type: "json", value: "https://www.tudomacae.com.br" },
  PUBLIC_HOST: { type: "json", value: "images.tudomacae.com.br" },
} as const;
/** The Classifieds Worker origin of the shared runtime; `originResponse` answers its photo reads. */
export const runtimeClassifiedsOrigin = "https://classifieds.test";

export function startRuntime(): void {
  execFileSync(
    join(process.cwd(), "node_modules/.bin/wrangler"),
    [
      "deploy",
      "--dry-run",
      "--env",
      "production",
      "--outdir",
      temporaryDirectory,
      "--config",
      "apps/public-images/wrangler.jsonc",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: join(temporaryDirectory, "wrangler.log"),
      },
      stdio: "pipe",
      timeout: 60_000,
    },
  );
  const bundleName = readdirSync(temporaryDirectory)
    .find(name => name.endsWith(".js"));
  if (!bundleName) throw new Error("Wrangler did not produce a Worker bundle");
  bundle = { name: bundleName, contents: readFileSync(join(temporaryDirectory, bundleName), "utf8") };

  runtime = new Miniflare({
    handleStructuredLogs: (log) => {
      if (log.message.includes("'public-image-delivery'")) runtimeLogs.push(log.message);
    },
    workers: [{
      config: {
        ...runtimeConfig,
        env: {
          EDITORIAL_ORIGIN_SERVICE: {
            type: "fetcher",
            handler: async (request) => {
              const url = new URL(request.url);
              expect(url.hostname).toBe("www.tudomacae.com.br");
              expect(url.pathname).toMatch(/^\/api\/imagens\/editorial\//);
              expect(request.headers.has("cookie")).toBe(false);
              expect(request.headers.has("authorization")).toBe(false);
              const requestId = request.headers.get("x-request-id");
              expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
              editorialRequestIds.push(requestId!);
              boundOriginRequests += 1;
              const retired = [...retiredImageSuffixes].some(suffix => url.pathname.endsWith(suffix));
              return new Response(request.method === "HEAD" || retired ? null : "bound original", {
                status: retired ? 404 : 200,
                headers: { "content-type": "image/png" },
              });
            },
          },
          ...publicVars,
          CLASSIFIEDS_ORIGIN: { type: "json", value: runtimeClassifiedsOrigin },
          EDITORIAL_CACHE_PROBE_SECRET: { type: "json", value: "runtime-probe-secret" },
          ENVIRONMENT: { type: "json", value: "qualification" },
        },
        manifest: bundleManifest(),
        name: "public-images-runtime-test",
      },
      dev: {
        outboundService: {
          type: "fetcher",
          handler: async (request) => {
            const url = new URL(request.url);
            if (url.hostname === "eu.i.posthog.com") {
              flagRequests += 1;
              throw new Error("Retired image rollout must not contact PostHog");
            }
            if (url.hostname === siteHostname) expectSiteOriginRequest(request);
            if (request.method === "HEAD") return headResponse(url);
            return originResponse(url);
          },
        },
      },
    }],
  });
}

function bundleManifest() {
  return { mainModule: bundle.name, modules: { [bundle.name]: { contents: bundle.contents, type: "esm" as const } }, modulesRoot: temporaryDirectory };
}

/** Starts the built Worker with `environment` (production by default); `outbound` answers every subrequest. */
export function startProductionRuntime(
  classifiedsOrigin: string,
  outbound: (request: MiniflareRequest) => Response,
  logs: string[],
  environment = "production",
): Miniflare {
  return new Miniflare({
    handleStructuredLogs: (log) => { logs.push(log.message); },
    workers: [{
      config: {
        ...runtimeConfig,
        env: {
          ...publicVars,
          ENVIRONMENT: { type: "json", value: environment },
          CLASSIFIEDS_ORIGIN: { type: "json", value: classifiedsOrigin },
        },
        manifest: bundleManifest(),
        name: "public-images-production-runtime-test",
      },
      dev: { outboundService: { type: "fetcher", handler: async request => outbound(request) } },
    }],
  });
}

const siteHostname = "www.tudomacae.com.br";

function expectSiteOriginRequest(request: MiniflareRequest): void {
  expect(request.method).not.toBe("HEAD");
  expect(request.headers.has("cookie")).toBe(false);
  expect(request.headers.has("authorization")).toBe(false);
  const requestId = request.headers.get("x-request-id");
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  editorialRequestIds.push(requestId!);
}

function isRetired(url: URL): boolean {
  return [...retiredImageSuffixes].some(suffix => url.pathname.endsWith(suffix));
}

function headResponse(url: URL): Response {
  // Hosted reads answer their own status; only the editorial origin is guarded with HEAD.
  expect(url.origin).not.toBe(runtimeClassifiedsOrigin);
  return new Response(null, { status: isRetired(url) ? 404 : 200 });
}

function originResponseHeaders(url: URL): Record<string, string> {
  return {
    "content-type": "image/png",
    ...(url.pathname.includes("aged-")
      ? {
          age: "104636",
          date: new Date(Date.now() - 104636_000).toUTCString(),
        }
      : {}),
    ...(url.hostname === siteHostname
      ? {
          "cdn-cache-control": "no-store",
          "cloudflare-cdn-cache-control": "no-store",
        }
      : {}),
  };
}

function originResponse(url: URL): Response {
  originRequests += 1;
  if (url.origin === runtimeClassifiedsOrigin && url.pathname.endsWith("private.webp")) return new Response(null, { status: 403 });
  if (url.origin === runtimeClassifiedsOrigin && isRetired(url)) return new Response(null, { status: 410 });
  const attempt = (originAttempts.get(url.pathname) ?? 0) + 1;
  originAttempts.set(url.pathname, attempt);
  if (url.pathname.includes("fallback") && attempt === 1) {
    return new Response("transform failed", {
      status: 502,
      headers: { "cf-resized": "err=9523" },
    });
  }
  return new Response(readFileSync(new URL(
    "../../../public/favicon-32x32.png",
    import.meta.url,
  )), { headers: originResponseHeaders(url) });
}

export async function stopRuntime(): Promise<void> {
  await runtime?.dispose();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
