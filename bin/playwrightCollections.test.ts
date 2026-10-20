import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const execute = promisify(execFile);
type Suite = { suites?: Suite[]; specs?: { file: string; title: string }[] };

function identities(suite: Suite): string[] {
  return [
    ...(suite.specs ?? []).map(spec => `${spec.file}: ${spec.title}`),
    ...(suite.suites ?? []).flatMap(identities),
  ].sort();
}

async function collect(config: string, env = process.env) {
  const { stdout } = await execute(process.execPath, [
    resolve("node_modules/@playwright/test/cli.js"), "test", `--config=${config}`,
    "--list", "--reporter=json",
  ], { env, maxBuffer: 8 * 1024 * 1024 });
  return identities(JSON.parse(stdout));
}

test.skipIf(inWorkers)("the application entrypoint collects only application journeys, while harness collections partition every case", async () => {
  const directory = await mkdtemp(join(tmpdir(), "playwright-collections-"));
  try {
    const all = join(directory, "all.config.mts");
    await writeFile(all, `import app from ${JSON.stringify(resolve("playwright.config.ts"))}; export default { ...app, testDir: ${JSON.stringify(resolve("tests/e2e"))}, testIgnore: [], globalSetup: undefined };`);
    const collections = await Promise.allSettled([
      collect("playwright.config.ts"),
      collect("playwright.harness.config.ts"),
      collect("playwright.harness-app.config.ts"),
      collect(all),
      collect("playwright.full.config.ts"),
    ]);
    const [application, isolatedHarness, appHarness, complete, full] = collections.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
    expect(application.length).toBeGreaterThan(0);
    expect(isolatedHarness.length).toBeGreaterThan(0);
    expect(appHarness).toEqual([
      "fixture-cleanup.spec.ts: Falha ao salvar subcategoria remove a categoria criada pela fixture",
    ]);
    const partition = [...application, ...isolatedHarness, ...appHarness];
    expect(new Set(partition).size).toBe(partition.length);
    expect(partition.sort()).toEqual(complete);
    expect(full).toEqual(complete);
  }
  finally { await rm(directory, { recursive: true, force: true }); }
}, 30_000);
