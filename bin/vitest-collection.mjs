import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestLogSink } from "./testLogBudget.ts";
import {
  forwardProcessGroupSignals,
  processGroupExitCode,
  spawnProcessGroup,
} from "./processGroup.ts";

const allTiers = [
  { name: "unit", script: "test:unit" },
  { name: "integration", script: "test:integration" },
];
// `--tier=<name>` restricts the run to that tier and is not forwarded to Vitest.
const tierArgument = /^--tier=(.*)$/;
const selected = new Set(process.argv.slice(2).map(argument => tierArgument.exec(argument)?.[1]).filter(name => name !== undefined));
const forwardedArguments = process.argv.slice(2).filter(argument => !tierArgument.test(argument));
const tiers = selected.size === 0 ? allTiers : allTiers.filter(({ name }) => selected.has(name));
if (selected.size !== 0 && tiers.length !== selected.size) {
  console.error(`Unknown Vitest tier in ${[...selected].join(", ")}; expected ${allTiers.map(({ name }) => name).join(" or ")}.`);
  process.exit(2);
}
const logDirectory = join(process.cwd(), "test-results/vitest-logs");
const temporaryLogDirectory = mkdtempSync(join(tmpdir(), "vitest-logs-"));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function runTier({ name, script }) {
  const logPath = join(logDirectory, `${name}.log`);
  const temporaryLogPath = join(temporaryLogDirectory, `${name}.log`);
  const log = openSync(temporaryLogPath, "w");
  const verbose = process.env.VITEST_VERBOSE === "1";
  console.log(`Vitest ${name} started\n  logs ${logPath}`);

  const group = spawnProcessGroup(
    pnpmCommand,
    ["run", script, ...forwardedArguments],
    { stdio: ["inherit", "pipe", "pipe"], env: process.env },
  );
  const { child } = group;
  const stdout = createTestLogSink({
    source: "vitest",
    verbose,
    writeConsole: chunk => process.stdout.write(chunk),
    writeLog: chunk => writeSync(log, chunk),
  });
  const stderr = createTestLogSink({
    source: "vitest",
    verbose,
    writeConsole: chunk => process.stderr.write(chunk),
    writeLog: chunk => writeSync(log, chunk),
  });
  child.stdout.on("data", chunk => stdout.write(chunk));
  child.stderr.on("data", chunk => stderr.write(chunk));

  let stopping = false;
  let forwardedSignal;
  let spawnFailed = false;
  const forwarding = forwardProcessGroupSignals(group, (signal) => {
    stopping = true;
    forwardedSignal = signal;
  });
  child.once("error", (error) => {
    spawnFailed = true;
    console.error(error);
  });

  return new Promise(resolve => child.once("close", async (code, childSignal) => {
    stdout.end();
    stderr.end();
    closeSync(log);
    // Tests may clean test-results while this tier is running. Publish only
    // after it exits so the complete stream remains available to the caller.
    mkdirSync(logDirectory, { recursive: true });
    copyFileSync(temporaryLogPath, logPath);
    let cleanupFailed = false;
    try {
      if (stopping) await forwarding.wait();
      else await group.terminateAndWait();
    }
    catch (error) {
      console.error(error);
      cleanupFailed = true;
    }
    forwarding.dispose();
    const signal = childSignal ?? forwardedSignal;
    if (signal !== undefined && signal !== null) {
      console.log(`Vitest ${name} exited due to ${signal}`);
      resolve({ code: null, signal });
      return;
    }
    const exitCode = processGroupExitCode(code, spawnFailed, cleanupFailed);
    console.log(`Vitest ${name} exited with code ${exitCode}`);
    resolve({ code: exitCode, signal: null });
  }));
}

let outcome = { code: 0, signal: null };
try {
  for (const tier of tiers) {
    outcome = await runTier(tier);
    if (outcome.signal !== null || outcome.code !== 0) break;
  }
}
finally {
  rmSync(temporaryLogDirectory, { recursive: true, force: true });
}

if (outcome.signal !== null) {
  // Re-raise only after cleanup so callers observe the original interruption.
  process.kill(process.pid, outcome.signal);
  await new Promise(() => {});
}
process.exitCode = outcome.code;
