import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { Miniflare } from "miniflare";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "www-origin-worker-"));
const applicationReads: string[] = [];
let runtime: Miniflare;

beforeAll(() => {
  execFileSync(
    join(process.cwd(), "node_modules/.bin/wrangler"),
    ["deploy", "--dry-run", "--env", "production", "--outdir", temporaryDirectory,
      "--config", "apps/www-origin/wrangler.jsonc"],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_LOG_PATH: join(temporaryDirectory, "wrangler.log") },
      stdio: "pipe",
      timeout: 60_000,
    },
  );
  const bundleName = readdirSync(temporaryDirectory).find(name => name.endsWith(".js"));
  if (!bundleName) throw new Error("Wrangler did not produce a Worker bundle");

  runtime = new Miniflare({
    workers: [{
      config: {
        cache: { enabled: true },
        compatibilityDate: "2026-09-25",
        compatibilityFlags: ["nodejs_compat"],
        env: {
          CF_VERSION_METADATA: { type: "json", value: { id: "version-1", tag: "", timestamp: "" } },
          WORKERS_ENVIRONMENT: { type: "json", value: "production" },
          WEB_WORKER: {
            type: "fetcher",
            handler: async (request) => {
              const url = new URL(request.url);
              applicationReads.push(url.pathname);
              if (url.pathname === "/sitemaps/anuncios.xml") {
                return new Response(`<urlset>${applicationReads.length}</urlset>`, {
                  headers: { "cache-control": "public, max-age=3600", "content-type": "application/xml", "x-terms-worker-version": "version-1" },
                });
              }
              return new Response(`${request.method} ${url.pathname} ${await request.text()}`, {
                headers: { "content-type": "text/html", "x-terms-worker-version": "version-1" },
              });
            },
          },
          WWW_ORIGIN_SIGNALS: { type: "analytics-engine-dataset", name: "www_origin_signals" },
        },
        manifest: {
          mainModule: bundleName,
          modules: {
            [bundleName]: {
              contents: readFileSync(join(temporaryDirectory, bundleName), "utf8"),
              type: "esm",
            },
          },
          modulesRoot: temporaryDirectory,
        },
        name: "www-origin-runtime-test",
        type: "worker",
      },
      dev: {
        outboundService: {
          type: "fetcher",
          handler: async () => {
            throw new Error("The router makes no outbound request");
          },
        },
      },
    }],
  });
}, 60_000);

afterAll(async () => {
  await runtime?.dispose();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

beforeEach(() => {
  applicationReads.length = 0;
});

test("the bundled Worker sends pages and writes to the Web Worker binding", async () => {
  const page = await runtime.dispatchFetch("https://www.tudomacae.com.br/noticias", { headers: { accept: "text/html" } });
  expect(page.headers.get("x-www-origin")).toBe("terms-workers");
  expect(await page.text()).toBe("GET /noticias ");
  const write = await runtime.dispatchFetch("https://www.tudomacae.com.br/anuncio/1/carro", {
    method: "POST", headers: { "x-rsc-action": "abc#save" }, body: "[1]",
  });
  expect(await write.text()).toBe("POST /anuncio/1/carro [1]");
});

test("the retired machine host answers 404 without reaching any origin", async () => {
  const response = await runtime.dispatchFetch("https://mcp.tudomacae.com.br/mcp", {
    method: "POST", headers: { authorization: "Bearer editorial-session" }, body: "{}",
  });
  await response.text();
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(applicationReads).toEqual([]);
});

test("the ad sitemap is served from the colo cache after the first read", async () => {
  const read = async () => {
    const response = await runtime.dispatchFetch("https://www.tudomacae.com.br/sitemaps/anuncios.xml", {
      headers: { "user-agent": "Googlebot/2.1" },
    });
    return { body: await response.text(), cacheStatus: response.headers.get("cf-cache-status") };
  };
  const first = await read();
  const second = await read();
  expect(first.cacheStatus).toBeNull();
  expect(second).toEqual({ body: first.body, cacheStatus: "HIT" });
  expect(applicationReads.filter(path => path === "/sitemaps/anuncios.xml")).toHaveLength(1);
});
