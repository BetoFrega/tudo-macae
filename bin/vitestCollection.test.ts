// @vitest-environment node
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const execute = promisify(execFile);
const runner = resolve("bin/vitest-collection.mjs");
const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function fixture(unit: string, integration: string) {
  const root = await mkdtemp(join(tmpdir(), "vitest-collection-"));
  fixtures.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({
    scripts: {
      "test:unit": "node unit.mjs",
      "test:integration": "node integration.mjs",
    },
  }));
  await writeFile(join(root, "unit.mjs"), unit);
  await writeFile(join(root, "integration.mjs"), integration);
  return root;
}

async function waitForFile(path: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await readFile(path, "utf8");
      return;
    }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

test.skipIf(inWorkers)("runs unit before integration with shared arguments and concise persisted output", async () => {
  const root = await fixture(
    `
import { appendFileSync, rmSync } from "node:fs";
appendFileSync("order", "unit " + process.argv.slice(2).join(" ") + "\\n");
console.log(" RUN  v5.0.0 unit");
console.log(" ✓ unit-passing.test.ts (1 test)");
console.log(" Test Files  1 passed (1)");
rmSync("test-results", { recursive: true, force: true });
`,
    `
import { appendFileSync } from "node:fs";
appendFileSync("order", "integration " + process.argv.slice(2).join(" ") + "\\n");
console.log(" RUN  v5.0.0 integration");
console.log(" ✓ integration-passing.test.ts (1 test)");
console.log(" Test Files  1 passed (1)");
`,
  );

  const result = await execute(process.execPath, [runner, "--bail=1"], { cwd: root });

  expect(await readFile(join(root, "order"), "utf8")).toBe(
    "unit --bail=1\nintegration --bail=1\n",
  );
  expect(result.stdout).toContain("Vitest unit started");
  expect(result.stdout).toContain("Vitest unit exited with code 0");
  expect(result.stdout).toContain("Vitest integration started");
  expect(result.stdout).not.toContain("unit-passing.test.ts");
  expect(result.stdout).not.toContain("integration-passing.test.ts");
  expect(await readFile(join(root, "test-results/vitest-logs/unit.log"), "utf8"))
    .toContain("unit-passing.test.ts");
  expect(await readFile(join(root, "test-results/vitest-logs/integration.log"), "utf8"))
    .toContain("integration-passing.test.ts");
});

test.skipIf(inWorkers)("runs only the selected tier without forwarding the selector", async () => {
  const record = `
import { appendFileSync } from "node:fs";
appendFileSync("order", process.env.npm_lifecycle_event + " " + process.argv.slice(2).join(" ") + "\\n");
`;
  const root = await fixture(record, record);

  await execute(process.execPath, [runner, "--tier=integration", "--bail=1"], { cwd: root });

  expect(await readFile(join(root, "order"), "utf8")).toBe("test:integration --bail=1\n");
  await expect(execute(process.execPath, [runner, "--tier=e2e"], { cwd: root })).rejects.toMatchObject({
    code: 2,
    stderr: expect.stringContaining("Unknown Vitest tier in e2e"),
  });
});

test.skipIf(inWorkers)("stops after a failed unit tier while preserving diagnostics and its exit code", async () => {
  const root = await fixture(
    `
console.log(" ❯ unit-failing.test.ts (1 test | 1 failed)");
console.error("AssertionError: expected 1 to be 2");
console.error(" ❯ unit-failing.test.ts:12:18");
process.exit(23);
`,
    `
import { writeFileSync } from "node:fs";
writeFileSync("integration-ran", "yes");
`,
  );

  await expect(execute(process.execPath, [runner], { cwd: root })).rejects.toMatchObject({
    code: 23,
    stdout: expect.stringContaining("unit-failing.test.ts"),
    stderr: expect.stringMatching(
      /AssertionError: expected 1 to be 2[\s\S]*unit-failing\.test\.ts:12:18/,
    ),
  });

  await expect(readFile(join(root, "integration-ran"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(root, "test-results/vitest-logs/unit.log"), "utf8"))
    .toContain("AssertionError: expected 1 to be 2");
});

test.skipIf(inWorkers).each(["SIGINT", "SIGTERM"] as const)("preserves an external %s interruption", async (signal) => {
  const root = await fixture(
    `
import { writeFileSync } from "node:fs";
writeFileSync("ready", "yes");
setInterval(() => {}, 1000);
`,
    `
import { writeFileSync } from "node:fs";

writeFileSync("integration-ran", "yes");
`,
  );
  const child = spawn(process.execPath, [runner], { cwd: root, stdio: "ignore" });
  const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, childSignal) => resolve({ code, signal: childSignal }));
    },
  );

  await waitForFile(join(root, "ready"));
  child.kill(signal);

  await expect(completion).resolves.toEqual({ code: null, signal });
  await expect(readFile(join(root, "integration-ran"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
}, 10_000);
