import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { repositoryRoot } from "../../../bin/appPorts.ts";
import { playwrightArguments } from "./playwrightArguments.ts";
import { createWriteStream, mkdirSync, mkdtempSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { finished } from "node:stream/promises";
import { createTestLogSink, isRunnerTimeout } from "../../../bin/testLogBudget.ts";
import {
  forwardFirstProcessInterrupt,
  processGroupExitCode,
  spawnProcessGroup,
} from "../../../bin/processGroup.ts";
import { playwrightProcessEnvironment } from "./playwrightProcessEnvironment.ts";

process.chdir(repositoryRoot);

let selectedConfig;
let selectedReporter;
const runnerArguments = playwrightArguments(process.argv.slice(2), (option, value) => {
  if (option === "--config" || option === "-c") selectedConfig = resolve(value);
  if (option === "--reporter") selectedReporter = value;
});
const humanReporters = new Set(["list", "line", "dot", "html"]);
const humanConfigs = new Set(["", ".full", ".harness", ".harness-app"].map(
  variant => resolve(`tests/e2e/playwright${variant}.config.ts`),
));
// Custom configuration code is not executed twice to inspect its reporter.
const machineReporter = selectedReporter !== undefined
  ? selectedReporter.split(",").some(reporter => !humanReporters.has(reporter))
  : selectedConfig !== undefined && !humanConfigs.has(selectedConfig);

const logPath = "test-results/e2e-logs/playwright.log";
const spoolDirectory = mkdtempSync(join(tmpdir(), "tudomacae-e2e-logs-"));
const spoolPath = join(spoolDirectory, "playwright.log");
const logFile = createWriteStream(spoolPath);
let logFailed = false;
let outputFailed = false;
let outputTermination;
let outputCleanupFailed = false;
const failedOutputs = new Set();
const blocked = new Set();
function resume(stream) {
  blocked.delete(stream);
  if (blocked.size !== 0) return;
  child.stdout.resume();
  child.stderr.resume();
}
function write(stream, chunk) {
  if (failedOutputs.has(stream)) return;
  if (stream.write(chunk)) return;
  blocked.add(stream);
  child.stdout.pause();
  child.stderr.pause();
}
let incompleteReported = false;
function writeSummary(chunk) {
  if (/^Log completo:/.test(chunk)) return;
  if (chunk === "[runner] Resumo incompleto\n") {
    if (incompleteReported) return;
    incompleteReported = true;
  }
  write(process.stdout, chunk);
}
const persisted = finished(logFile).catch(() => {
  logFailed = true;
  console.error(`Não foi possível gravar o log completo: ${spoolPath}`);
  resume(logFile);
});
let timedOut = false;
function sink(writeConsole) {
  return createTestLogSink({
    source: "runner",
    verbose: machineReporter || process.env.E2E_VERBOSE === "1",
    summary: machineReporter ? undefined : { logPath, writeConsole: writeSummary },
    writeConsole,
    writeLog: (chunk) => {
      if (!logFailed) write(logFile, chunk);
      if (isRunnerTimeout(chunk)) timedOut = true;
    },
  });
}
const stdout = sink(chunk => write(process.stdout, chunk));
const stderr = sink(chunk => write(process.stderr, chunk));

const group = spawnProcessGroup(process.execPath, [
  createRequire(import.meta.url).resolve("@playwright/test/cli"),
  "test",
  "--config=tests/e2e/playwright.config.ts",
  ...runnerArguments,
], {
  env: playwrightProcessEnvironment(),
  stdio: ["inherit", "pipe", "pipe"],
});
const { child } = group;
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", () => {
    failedOutputs.add(stream);
    resume(stream);
    outputFailed = true;
    if (process.exitCode === undefined || process.exitCode === 0) process.exitCode = 1;
    outputTermination ??= group.terminateAndWait().catch(() => {
      outputCleanupFailed = true;
    });
  });
}
for (const stream of [logFile, process.stdout, process.stderr]) {
  stream.on("drain", () => resume(stream));
}
child.stdout.on("data", chunk => stdout.write(chunk));
child.stderr.on("data", chunk => stderr.write(chunk));

const forwarding = forwardFirstProcessInterrupt(group);

let spawnFailed = false;
child.once("error", (error) => {
  spawnFailed = true;
  console.error(error);
});
const code = await new Promise(resolve => child.once("close", resolve));
let cleanupFailed = false;
try {
  await group.terminateAndWait();
  await forwarding.wait();
  await outputTermination;
}
catch (error) {
  cleanupFailed = true;
  console.error(error);
}
stdout.end({ incomplete: forwarding.interrupted || outputFailed || spawnFailed || (code !== 0 && timedOut) });
stderr.end({ incomplete: forwarding.interrupted || outputFailed || spawnFailed || (code !== 0 && timedOut) });
logFile.end();
await persisted;
if (!logFailed) {
  try {
    mkdirSync("test-results/e2e-logs", { recursive: true });
    await copyFile(spoolPath, logPath);
    await rm(spoolDirectory, { recursive: true, force: true });
    if (!machineReporter) write(process.stdout, `Log completo: ${logPath}\n`);
  }
  catch {
    logFailed = true;
    console.error(`Não foi possível gravar o log completo: ${logPath}. Log incremental: ${spoolPath}`);
  }
}
forwarding.dispose();
process.exitCode = processGroupExitCode(code, spawnFailed, cleanupFailed || logFailed || outputFailed || outputCleanupFailed);
