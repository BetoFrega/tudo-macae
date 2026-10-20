import { expect, test } from "vitest";
import {
  createTestLogSink,
  redactTestLog,
  type TestLogSource,
} from "./testLogBudget";

test("redacts native verification links before they reach any log sink", () => {
  expect(redactTestLog(
    "follow this link: http://127.0.0.1/action?mode=verifyEmail&oobCode=secret&apiKey=fake-key\n",
  )).toBe("follow this link: [verification link redacted]\n");
});

test.each([
  ["build", "  Creating an optimized production build ...\n", true],
  ["build", "  Generating static pages using 9 workers (14/56)\n", false],
  ["build", "✓ Generating static pages using 9 workers (56/56) in 1s\n", true],
  ["build", "├ ◐ /admin\n", false],
  ["server", "{\"severity\":\"INFO\",\"message\":\"editorial_mcp_request\"}\n", false],
  ["server", "- Network: http://192.0.2.1:3000\n", false],
  ["server", "✓ Ready in 145ms\n", true],
  ["server", "{\"severity\":\"ERROR\",\"message\":\"request failed\"}\n", true],
  ["build", "\u001b[96mfile.ts\u001b[0m - \u001b[91merror\u001b[0m TS2345\n", true],
] as const)("budgets %s output", (source, input, visible) => {
  const console: string[] = [];
  const persisted: string[] = [];
  const sink = createTestLogSink({
    source: source as TestLogSource,
    writeConsole: chunk => console.push(chunk),
    writeLog: chunk => persisted.push(chunk),
  });

  sink.write(input);
  sink.end();

  expect(console.join("") !== "").toBe(visible);
  expect(persisted.join("")).toBe(redactTestLog(input));
});

test("verbose mode restores detailed sanitized output", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server",
    verbose: true,
    writeConsole: chunk => console.push(chunk),
  });

  sink.write("{\"severity\":\"INFO\",\"message\":\"editorial_mcp_request\"}\n");
  sink.end();

  expect(console.join("")).toContain("editorial_mcp_request");
});

test("buffers partial chunks so one decision is made per line", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server",
    writeConsole: chunk => console.push(chunk),
  });

  sink.write("{\"severity\":\"ERR");
  sink.write("OR\",\"message\":\"failed\"}\n");
  sink.end();

  expect(console.join("")).toContain("failed");
});
test.each([
  "{\"outcome\":\"failure\",\"event\":\"download\",\"operation\":\"preview\"}",
  "FATAL: download failed",
  "Failed: download failed",
])("separates recognized indented diagnostics: %s", (diagnostic) => {
  const output: string[] = [];
  const sink = createTestLogSink({
    source: "runner", summary: { logPath: "playwright.log" },
    writeConsole: chunk => output.push(chunk),
  });
  const block = `Error: first\n      at fatal (fatal.ts:20:1)\n    ${diagnostic}\n      at preview (media.ts:10:2)\n`;
  sink.write(block);
  sink.write(block);
  sink.end();
  const totals = output.filter(line => line.includes("2 ocorrências"));
  expect(totals).toHaveLength(2);
  expect(totals.some(line => line.includes("Error: first") && line.includes("fatal.ts"))).toBe(true);
  expect(totals.some(line => line.includes(diagnostic) && line.includes("media.ts"))).toBe(true);
});
