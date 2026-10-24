// Serves the built web Worker bundle (`dist/server`) and requests real pages from it.
//
// The Worker bundle is a different artifact from what `next build` and the Next-renderer E2E
// exercise: a renderer or shim regression (for example a recursive `<Image>`) hangs every page
// there and nowhere else. A bundle that builds but cannot answer `/` must fail before production
// mutation and in PR checks, so this gate serves the bundle and reads the pages.
//
// `wrangler dev -c dist/server/wrangler.json --local` serves the exact file the delivery script
// publishes, with the production `env` vars. Service bindings show "not connected" locally, and
// the pages checked here render without them. `vite preview` would rebuild the dev pipeline
// instead of serving that artifact.
//
// Usage: node bin/web-bundle-smoke.mjs   (after `CLOUDFLARE_ENV=production vite build -c vite.vinext.config.ts`)
// `WEB_BUNDLE_SMOKE_PORT` pins the port; otherwise the OS picks a free one.
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawnProcessGroup } from "./processGroup.ts";

const WRANGLER_CONFIG = "dist/server/wrangler.json";
const STARTUP_TIMEOUT_MS = 60_000;
// A healthy bundle answers in well under a second; a broken one never answers.
const REQUEST_TIMEOUT_MS = 20_000;
const DIAGNOSTIC_LINES = 6;
const DIAGNOSTIC_LINE_LENGTH = 160;

/** What a page must contain: a closed document proves the whole body streamed. */
const PAGES = [
  { path: "/", markers: ["</html>", "<img"] },
  { path: "/termos-e-condicoes", markers: ["</html>"] },
];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function tail(logPath) {
  const lines = readFileSync(logPath, "utf8")

    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  return lines.slice(-DIAGNOSTIC_LINES).map(line => `  ${line.slice(0, DIAGNOSTIC_LINE_LENGTH)}`).join("\n");
}

async function checkPage(origin, { path, markers }) {
  const started = Date.now();
  try {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    // The body read shares the request's signal, so a stream that stalls midway also times out.
    const body = await response.text();
    if (response.status !== 200) return `${path}: status ${response.status}, expected 200`;
    const missing = markers.filter(marker => !body.includes(marker));
    if (missing.length > 0) return `${path}: body (${body.length} bytes) lacks ${missing.join(", ")}`;
    console.log(`web-bundle-smoke ${path} 200 ${Date.now() - started}ms`);
    return undefined;
  }
  catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return timedOut
      ? `${path}: no complete response within ${REQUEST_TIMEOUT_MS}ms`
      : `${path}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function waitForReady(logPath, port, exited) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited.done) return `wrangler exited with code ${exited.code} before it was ready`;
    if (readFileSync(logPath, "utf8").includes(`Ready on http://127.0.0.1:${port}`)) return undefined;
    await sleep(200);
  }
  return `wrangler was not ready within ${STARTUP_TIMEOUT_MS}ms`;
}

async function main() {
  if (!existsSync(WRANGLER_CONFIG)) {
    console.error(`web-bundle-smoke: ${WRANGLER_CONFIG} missing; build first with CLOUDFLARE_ENV=production npx vite build -c vite.vinext.config.ts`);
    return 1;
  }
  const port = process.env.WEB_BUNDLE_SMOKE_PORT ? Number(process.env.WEB_BUNDLE_SMOKE_PORT) : await freePort();
  const workDirectory = mkdtempSync(join(tmpdir(), "web-bundle-smoke-"));
  const logPath = join(workDirectory, "wrangler.log");
  const logDescriptor = openSync(logPath, "w");
  const exited = { done: false, code: null };
  const group = spawnProcessGroup(
    "npx",
    ["wrangler", "dev", "-c", WRANGLER_CONFIG, "--local", "--ip", "127.0.0.1", "--port", String(port), "--persist-to", join(workDirectory, "state")],
    { stdio: ["ignore", logDescriptor, logDescriptor], env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } },
  );
  group.child.on("exit", (code) => {
    exited.done = true;
    exited.code = code;
  });
  group.child.on("error", () => {
    exited.done = true;
  });
  const interrupt = () => void group.terminateAndWait().finally(() => process.exit(130));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  let failures = [];
  try {
    const notReady = await waitForReady(logPath, port, exited);
    if (notReady) failures = [notReady];
    else {
      const origin = `http://127.0.0.1:${port}`;
      // Concurrent, so a hung bundle costs one timeout rather than one per page.
      failures = (await Promise.all(PAGES.map(page => checkPage(origin, page)))).filter(Boolean);
    }
    if (failures.length > 0) {
      console.error(`web-bundle-smoke FAILED (${WRANGLER_CONFIG}):\n${failures.map(failure => `  ${failure}`).join("\n")}\nwrangler log tail:\n${tail(logPath)}`);
    }
  }
  finally {
    try {
      await group.terminateAndWait();
    }
    catch (error) {
      console.error(`web-bundle-smoke: could not stop wrangler (pid ${group.pid}): ${error instanceof Error ? error.message : error}`);
      failures.push("cleanup");
    }
    closeSync(logDescriptor);
    rmSync(workDirectory, { recursive: true, force: true });
  }
  return failures.length > 0 ? 1 : 0;
}

process.exitCode = await main();
