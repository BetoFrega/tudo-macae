import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { promisify, stripVTControlCharacters } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);

test("slow Worker compilation reaches the real bundled HTTP contracts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worker-setup-regression-"));
  const preload = join(directory, "slow-build.mjs");
  try {
    await writeFile(preload, `
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const execute = childProcess.execFileSync;
childProcess.execFileSync = function(...args) {
  if (String(args[0]).replaceAll("\\\\", "/").endsWith("/wrangler")) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 11_000);
    process.stderr.write("WORKER_SETUP_DELAY_APPLIED\\n");
  }
  return execute.apply(this, args);
};
syncBuiltinESMExports();
`);
    const { exitCode, output, diagnostics } = await runSiteSearchBundleSuite(preload);
    const result = stripVTControlCharacters(output);
    diagnostics.push(...outputDiagnostics(result));
    expect(exitCode, `site-search bundled HTTP contracts: ${diagnostics.join("; ")}`).toBe(0);
    expect(/^WORKER_SETUP_DELAY_APPLIED$/m.test(result), "slow build delay was applied").toBe(true);
    expect(/Tests\s+2 passed \(2\)/.test(result), "both bundled HTTP contracts ran").toBe(true);
    expect(/skipped/.test(result), "bundled HTTP contracts were not skipped").toBe(false);
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 85_000);

type ChildRun = { exitCode: number; output: string; diagnostics: string[] };

async function runSiteSearchBundleSuite(preload: string): Promise<ChildRun> {
  try {
    const result = await execute(process.execPath, [
      join(process.cwd(), "node_modules/.bin/vitest"),
      "run", "--config", "vitest.worker.config.mts",
      "apps/site-search/bundle.runtime.test.ts",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${pathToFileURL(preload)}`].filter(Boolean).join(" "),
        WRANGLER_SEND_METRICS: "false",
        NO_COLOR: "1",
      },
      timeout: 80_000,
    });
    return { exitCode: 0, output: result.stdout + result.stderr, diagnostics: [] };
  }
  catch (error) {
    if (!(error instanceof Error)) return { exitCode: 1, output: "", diagnostics: [] };
    return { exitCode: 1, output: failedChildOutput(error), diagnostics: failedChildDiagnostics(error) };
  }
}

function failedChildDiagnostics(error: Error): string[] {
  const diagnostics: string[] = [];
  if ("killed" in error && error.killed === true) diagnostics.push("child exceeded its 80-second deadline");
  if ("code" in error && typeof error.code === "number") diagnostics.push(`child exit code ${error.code}`);
  if ("code" in error && ["ENOENT", "ENOBUFS"].includes(String(error.code))) diagnostics.push(String(error.code));
  return diagnostics;
}

function failedChildOutput(error: Error): string {
  let output = "";
  if ("stdout" in error && typeof error.stdout === "string") output += error.stdout;
  if ("stderr" in error && typeof error.stderr === "string") output += error.stderr;
  return output;
}

// Child output can contain provider credentials; expose only fixed classes and numeric diagnostics.
function outputDiagnostics(result: string): string[] {
  const diagnostics: string[] = [];
  const timeout = result.match(/Hook timed out in \d+ms/)?.[0];
  if (timeout) diagnostics.push(timeout);
  if (/Command failed: .*[/\\]wrangler\b/.test(result)) diagnostics.push("Wrangler dry-run failed");
  for (const kind of ["AssertionError", "SyntaxError", "TypeError", "ReferenceError", "MiniflareCoreError", "ERR_MODULE_NOT_FOUND", "EADDRINUSE", "ECONNREFUSED"]) {
    if (result.includes(kind)) diagnostics.push(kind);
  }
  return [...diagnostics, ...testFailureDiagnostics(result)];
}

function testFailureDiagnostics(result: string): string[] {
  const diagnostics: string[] = [];
  const location = result.match(/apps\/site-search\/bundle\.runtime\.test\.ts:\d+:\d+/)?.[0];
  if (location) diagnostics.push(location);
  const comparison = result.match(/expected \d+ to be \d+/)?.[0];
  if (comparison) diagnostics.push(comparison);
  for (const [message, detail] of [
    ["Search Worker bundle missing", "setup: bundle missing"],
    ["Unexpected Worker dependency", "runtime: unexpected outbound dependency"],
    ["> bundled Worker rejects anonymous HTTP without loading identity keys", "failed contract: anonymous HTTP"],
    ["> bundled Worker checks signed runtime authority and audience", "failed contract: signed authority and audience"],
  ]) {
    if (result.includes(message)) diagnostics.push(detail);
  }
  return diagnostics;
}
