import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { spawnProcessGroup } from "./processGroup";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";
beforeEach((context) => {
  if (inWorkers) context.skip();
});

test.runIf(process.platform !== "win32")("reports cancellation after cleaning a signal-terminated child", async () => {
  const directory = await mkdtemp(join(tmpdir(), "catalog-runner-test-"));
  const readyPath = join(directory, "ready.json");
  await mkdir(join(directory, "tests/e2e/bin"), { recursive: true });
  await mkdir(join(directory, "bin"));
  await mkdir(join(directory, "tests/e2e/_helpers"), { recursive: true });
  await cp("tests/e2e/fixtures", join(directory, "tests/e2e/fixtures"), { recursive: true });
  await cp("tests/e2e/_helpers/offering-catalog-runner.mjs", join(directory, "tests/e2e/_helpers/offering-catalog-runner.mjs"));
  for (const file of ["processGroup.ts", "waitForProcessGroupExit.ts"]) {
    await cp(`bin/${file}`, join(directory, "bin", file));
  }
  await writeFile(join(directory, "tests/e2e/bin", "playwright.mjs"), `
import { renameSync, writeFileSync } from "node:fs";
const pendingPath = process.env.CATALOG_RUNNER_READY + ".pending";
writeFileSync(pendingPath, JSON.stringify({ pid: process.pid, certificate: process.env.NODE_EXTRA_CA_CERTS }));
renameSync(pendingPath, process.env.CATALOG_RUNNER_READY);
setInterval(() => {}, 1000);
`);
  const group = spawnProcessGroup(process.execPath, [join(directory, "tests/e2e/_helpers/offering-catalog-runner.mjs"), "test:e2e"], {
    cwd: directory,
    stdio: "ignore",
    env: { ...process.env, PATH: directory, CATALOG_RUNNER_READY: readyPath },
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    group.child.once("error", reject);
    group.child.once("close", resolve);
  });
  try {
    await expect.poll(() => existsSync(readyPath), { timeout: 5_000 }).toBe(true);
    const ready: { pid: number; certificate: string } = JSON.parse(await readFile(readyPath, "utf8"));
    group.signal("SIGTERM");
    expect(await closed).toBe(130);
    expect(existsSync(ready.certificate)).toBe(false);
    expect(() => process.kill(ready.pid, 0)).toThrow();
  }
  finally {
    await group.terminateAndWait();
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
