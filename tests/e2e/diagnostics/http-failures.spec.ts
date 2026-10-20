import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { createServer } from "node:http";
import { once } from "node:events";
import { expect, test, type Browser } from "@playwright/test";
import { spawnProcessGroup, type ProcessGroup } from "../../../bin/processGroup.ts";
import { createExpectedRenderFailureScope, httpFailureAttachment, httpFailureSchema, observeHttpFailures, type HttpFailure } from "../_helpers/httpDiagnostics";
import { withHttpDiagnostics, type HttpDiagnosticsTestInfo } from "../_helpers/httpDiagnosticsTest";

test("a real browser captures a 500 and its digest without retaining private body, URL or headers", async ({ browser }) => {
  const secret = "private-sentinel";
  const requestId = "11111111-1111-4111-8111-111111111111";
  const server = createServer((_request, response) => {
    response.writeHead(500, { "content-type": "text/x-component", "x-cloud-trace-context": `${"b".repeat(32)}/123;o=1`, "x-request-id": requestId, "set-cookie": `session=${secret}` });
    response.end(JSON.stringify({ digest: "98765", message: secret }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing local server port");
  const context = await browser.newContext();
  try {
    const failures: HttpFailure[] = [];
    const pending: Promise<void>[] = [];
    observeHttpFailures(context, failures, pending, `http://127.0.0.1:${address.port}`);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/admin/categorias/${secret}?token=${secret}`);
    await page.evaluate(async ({ actionId, secret }) => {
      await fetch("/", { method: "POST", headers: { "next-action": actionId }, body: secret });
    }, { actionId: "a".repeat(40), secret });
    await Promise.all(pending);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({ status: 500, path: "/admin/categorias/<id>", bodyKind: "rsc", digest: "98765", traceId: "b".repeat(32), requestId });
    expect(failures[1]).toMatchObject({ status: 500, path: "/", actionId: "a".repeat(40), requestBodyBytes: Buffer.byteLength(secret) });
    expect(failures[0]?.durationMs).toEqual(expect.any(Number));
    expect(failures[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(failures)).not.toContain(secret);
    expect(httpFailureSchema.parse(failures[0])).toEqual(failures[0]);
  }
  finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
const diagnosticsBaseURL = "http://harness.test";
const modes = ["500", "500-and-401", "401", "expected-500", "expected-then-unexpected-500"] as const;
type Mode = (typeof modes)[number];

async function runDiagnostics(browser: Browser, mode: Mode) {
  const attachments: { name: string; body: Buffer }[] = [];
  const testInfo: HttpDiagnosticsTestInfo = {
    project: { use: { baseURL: diagnosticsBaseURL } },
    attach: async (name, options) => {
      attachments.push({ name, body: options?.body as Buffer });
    },
  };
  const expectedRenderFailure = createExpectedRenderFailureScope();
  let error: unknown;
  try {
    await withHttpDiagnostics({ browser, expectedRenderFailure }, testInfo, async () => {
      const context = await browser.newContext({ baseURL: diagnosticsBaseURL });
      try {
        const page = await context.newPage();
        await page.route("**/*", route => route.fulfill({ status: route.request().url().endsWith("/401") ? 401 : 500, contentType: "text/html", body: "controlled failure" }));
        if (mode.startsWith("expected")) await expectedRenderFailure.during("/500", () => page.goto("/500"));
        else await page.goto(mode === "401" ? "/401" : "/500");
        if (mode === "expected-then-unexpected-500") await page.evaluate(() => fetch("/500").then(() => undefined));
        if (mode === "500-and-401") await page.evaluate(() => fetch("/401").then(() => undefined));
      }
      finally {
        await context.close();
      }
    });
  }
  catch (caught) {
    error = caught;
  }
  return { attachments, error };
}

function failuresOf(attachments: { name: string; body: Buffer }[]): HttpFailure[] | undefined {
  const attachment = attachments.find(item => item.name === httpFailureAttachment);
  return attachment && JSON.parse(attachment.body.toString("utf8"));
}

for (const mode of modes) {
  test(`browser HTTP diagnostics distinguish responses: ${mode}`, async ({ browser }) => {
    const passes = ["401", "expected-500"].includes(mode);
    const { attachments, error } = await runDiagnostics(browser, mode);
    if (passes) expect(error).toBeUndefined();
    else expect((error as Error).message).toMatch(/^HTTP 5xx observed/);
    const failures = failuresOf(attachments);
    if (mode === "401") {
      expect(failures).toBeUndefined();
      return;
    }
    expect(failures).toHaveLength(mode === "expected-then-unexpected-500" ? 2 : 1);
    expect(failures![0]!.status).toBe(500);
    if (mode.startsWith("expected")) expect(failures![0]!.expected).toBe("malformed-emulator-fixture");
    if (mode === "expected-then-unexpected-500") expect(failures![1]!.expected).toBeUndefined();
  });
}

// The one nested Playwright run proves what needs the real runner: the fixture
// is automatic, the test fails, and the attachment survives a retry. The child
// test timeout is explicit and the parent deadline is derived from it, so the
// child always expires first and writes its report.
const childTestTimeoutMs = 20_000;
const childAttempts = 2;
const childStartupAndReportMs = 10_000;
const childDeadlineMs = childAttempts * childTestTimeoutMs + childStartupAndReportMs;
const parentCleanupMs = 15_000;
const childOutputLimit = 4_000;
const killGraceMs = 5_000;

type ChildAttempt = {
  steps: { title: string; error?: unknown }[];
  status: string;
  attachments: { name: string; body: string }[];
};

function childSpecSource() {
  return `import {expect} from ${JSON.stringify(import.meta.resolve("@playwright/test"))};
      import {httpDiagnosticsTest as test} from ${JSON.stringify(fileURLToPath(new URL("../_helpers/httpDiagnosticsTest.ts", import.meta.url)))};
      test('HTTP responses', async ({page, launchOptions}) => {
        await test.step('configured executable reaches the child', async () => {
          expect(launchOptions.executablePath).toBe(process.env.E2E_CHROMIUM_EXECUTABLE || undefined);
        });
        await page.route('**/*', route => route.fulfill({status:500,contentType:'text/html',body:'controlled failure'}));
        await page.goto('/500');
      });`;
}

async function writeChildSuite(directory: string, chromiumExecutable: string | undefined) {
  await writeFile(join(directory, "package.json"), "{\"type\":\"module\"}");
  const config = join(directory, "playwright.config.mjs");
  await writeFile(config, `export default ${JSON.stringify({
    testDir: directory, workers: 1, retries: childAttempts - 1, timeout: childTestTimeoutMs,
    reporter: [["json", { outputFile: join(directory, "results.json") }]],
    use: { baseURL: diagnosticsBaseURL, ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}) },
  })}`);
  await writeFile(join(directory, "sample.spec.ts"), childSpecSource());
  return config;
}

async function stopProcessGroup(group: ProcessGroup) {
  const stopped = group.terminateAndWait();
  const escalation = setTimeout(() => group.signal("SIGKILL"), killGraceMs);
  try {
    await stopped;
  }
  finally {
    clearTimeout(escalation);
  }
}

// Resolves only after every process in the child's group has exited, so the
// caller may remove the child's input directory.
async function runChildSuite(config: string, chromiumExecutable: string | undefined) {
  const group = spawnProcessGroup(process.execPath, [createRequire(import.meta.url).resolve("@playwright/test/cli"), "test", "--config", config], {
    env: { ...process.env, ...(chromiumExecutable ? { E2E_CHROMIUM_EXECUTABLE: chromiumExecutable } : {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [group.child.stdout, group.child.stderr]) {
    stream?.on("data", (chunk) => {
      output = (output + chunk).slice(-childOutputLimit);
    });
  }
  let timedOut = false;
  let escalation: NodeJS.Timeout | undefined;
  const deadline = setTimeout(() => {
    timedOut = true;
    group.signal("SIGTERM");
    escalation = setTimeout(() => group.signal("SIGKILL"), killGraceMs);
  }, childDeadlineMs);
  try {
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      group.child.once("error", reject);
      group.child.once("close", (code, signal) => resolve({ code, signal }));
    });
    return { killed: timedOut, signal: exit.signal, code: exit.code, output };
  }
  finally {
    clearTimeout(deadline);
    try {
      await stopProcessGroup(group);
    }
    finally {
      clearTimeout(escalation);
    }
  }
}

function expectAttemptDiagnostics(attempt: ChildAttempt) {
  const configurationSteps = attempt.steps.filter(step => step.title === "configured executable reaches the child");
  expect(configurationSteps).toHaveLength(1);
  expect(configurationSteps[0]!.error).toBeUndefined();
  expect(attempt.status).toBe("failed");
  const attachment = attempt.attachments.find(item => item.name === httpFailureAttachment);
  expect(attachment).toBeDefined();
  const failures = JSON.parse(Buffer.from(attachment!.body, "base64").toString("utf8"));
  expect(failures).toHaveLength(1);
  expect(failures[0].status).toBe(500);
}

test("an unexpected 500 fails its test and keeps its attachment on every attempt", async ({ playwright }, testInfo) => {
  testInfo.setTimeout(childDeadlineMs + parentCleanupMs);
  const directory = await mkdtemp(join(tmpdir(), "browser-diagnostics-"));
  try {
    // Always explicit, so the child's assertion proves the executable is forwarded.
    const chromiumExecutable = process.env.E2E_CHROMIUM_EXECUTABLE || playwright.chromium.executablePath();
    const config = await writeChildSuite(directory, chromiumExecutable);
    const startedAt = performance.now();
    const child = await runChildSuite(config, chromiumExecutable);
    const durationMs = Math.round(performance.now() - startedAt);
    const outcome = { durationMs, killed: child.killed, signal: child.signal, code: child.code };
    const report = await readFile(join(directory, "results.json"), "utf8").catch(() => {
      throw new Error(`Child diagnostics report unavailable: ${JSON.stringify({ ...outcome, reportExists: false })}\n${child.output}`);
    });
    await testInfo.attach("child-process-outcome.json", {
      body: JSON.stringify({ ...outcome, reportExists: true }), contentType: "application/json",
    });
    expect({ killed: child.killed, signal: child.signal, code: child.code }).toEqual({ killed: false, signal: null, code: 1 });
    const result = JSON.parse(report);
    expect(result.errors).toEqual([]);
    const attempts: ChildAttempt[] = result.suites[0].specs[0].tests[0].results;
    expect(attempts).toHaveLength(childAttempts);
    for (const attempt of attempts) expectAttemptDiagnostics(attempt);
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
});
