import { setTimeout as delay } from "node:timers/promises";

import { workerVersionHeader } from "@tudomacae/www-origin-routing/contract";

/**
 * Pages that render through the web Worker on every request: the router's colo
 * cache holds none of them (`edgeCachedPaths`) and Cloudflare does not cache
 * HTML. Caching one of them at the edge would let a stored copy answer for a
 * broken version.
 */
export const webPageProbePaths = ["/", "/termos-e-condicoes", "/noticias"];

/**
 * Five shared retries ten seconds apart give the new version about a minute to
 * reach every colo. The response timeout covers the body, so a streamed 200
 * that stops before `</html>` fails.
 */
export const webPageProbeTiming = { retries: 5, retryDelayMs: 10_000, responseTimeoutMs: 10_000 };

const versionPattern = /^[a-f0-9-]{8,64}$/u;

async function readPage(request, path, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([request(`https://www.tudomacae.com.br${path}`, {
      headers: { "cache-control": "no-cache" }, redirect: "manual", signal: controller.signal,
    }), expired]);
    const version = response.headers.get(workerVersionHeader);
    if (response.status !== 200 || version === null) {
      await response.body?.cancel().catch(() => {});
      return { status: response.status, version };
    }
    return { status: response.status, version, body: await Promise.race([response.text(), expired]) };
  }
  finally {
    clearTimeout(timer);
  }
}

async function pageFailure(request, path, expectedVersion, timeoutMs) {
  let page;
  try {
    page = await readPage(request, path, timeoutMs);
  }
  catch (error) {
    return error?.message === "timeout"
      ? `GET ${path}: no complete response within ${timeoutMs} ms`
      : `GET ${path}: request failed`;
  }
  if (page.status !== 200) return `GET ${path}: HTTP ${page.status}`;
  if (page.version !== expectedVersion) {
    return `GET ${path}: served ${page.version && versionPattern.test(page.version) ? page.version : "no web Worker version"}`;
  }
  if (!page.body?.includes("</html>")) return `GET ${path}: document ends before </html>`;
  return undefined;
}

/** Every path must render a complete document from `expectedVersion` through `www`. */
export async function probeWebPages(expectedVersion, { request = fetch, wait = delay, paths = webPageProbePaths, timing = webPageProbeTiming } = {}) {
  let retries = timing.retries;
  for (const path of paths) {
    for (;;) {
      const failure = await pageFailure(request, path, expectedVersion, timing.responseTimeoutMs);
      if (!failure) break;
      if (retries === 0) throw new Error(`Web page probe failed: ${failure}`);
      retries -= 1;
      await wait(timing.retryDelayMs);
    }
  }
}

const restoreCommand = (name, version) =>
  `npx wrangler rollback '${version}' --name ${name} --message 'Restore previous production version'`;

async function rollBack({ workerName, previousVersion, sha, command, readActiveVersion }) {
  command(["rollback", previousVersion, "--name", workerName,
    "--message", `Automatic rollback: release ${sha.slice(0, 12)} failed www page probes`]);
  if (readActiveVersion() !== previousVersion) {
    throw new Error(`${workerName} does not serve ${previousVersion} after rollback`);
  }
}

/**
 * A web Worker that fails the page probes goes back to `previousVersion`, the
 * version that served before this delivery, and the delivery fails either way.
 * Wrangler refuses the rollback when the `DataCache` Durable Object's `exports`
 * or migrations changed between the versions; a first delivery, or one reusing
 * the serving bootstrap, has no other version to return to.
 */
export async function gateWebRelease(release) {
  const { workerName, version, previousVersion, pageProbe, record, summary } = release;
  let failure;
  try {
    await probeWebPages(version, pageProbe);
    summary(`- ${workerName}: ${webPageProbePaths.join(", ")} rendered through www.\n`);
    return;
  }
  catch (error) {
    failure = error.message;
  }
  const outcome = fields => record({ from: version, to: previousVersion, reason: failure, ...fields });
  if (!previousVersion || previousVersion === version) {
    outcome({ outcome: "not-attempted" });
    throw new Error(`${failure}. No earlier ${workerName} version is recorded; pick one from \`npx wrangler versions list --name ${workerName}\` and run ${restoreCommand(workerName, "<version-id>")}, or deliver a fixed main`);
  }
  try {
    await rollBack(release);
  }
  catch (error) {
    outcome({ outcome: "rollback-failed", detail: error.message });
    throw new Error(`${failure}. Rollback to ${previousVersion} failed: ${error.message}. Run ${restoreCommand(workerName, previousVersion)}; if Wrangler refuses it because the DataCache Durable Object changed, deliver a fixed main`);
  }
  summary(`- ${workerName}: rolled back to ${previousVersion} after: ${failure}\n`);
  try {
    await probeWebPages(previousVersion, { ...pageProbe, paths: ["/"] });
  }
  catch (error) {
    outcome({ outcome: "restored-unverified", detail: error.message });
    throw new Error(`${failure}. Rolled back ${workerName} to ${previousVersion}, which also fails: ${error.message}`);
  }
  outcome({ outcome: "restored" });
  throw new Error(`${failure}. Rolled back ${workerName} to ${previousVersion}; / renders again`);
}
