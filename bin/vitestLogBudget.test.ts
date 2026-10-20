import { expect, test } from "vitest";
import { createTestLogSink, redactTestLog } from "./testLogBudget";

function collect(input: string, verbose = false) {
  const console: string[] = [];
  const persisted: string[] = [];
  const sink = createTestLogSink({
    source: "vitest",
    verbose,
    writeConsole: chunk => console.push(chunk),
    writeLog: chunk => persisted.push(chunk),
  });

  sink.write(input);
  sink.end();

  return { console: console.join(""), persisted: persisted.join("") };
}

test("healthy Vitest output keeps lifecycle summaries and persists passing-file detail", () => {
  const input = [
    " RUN  v5.0.0 /workspace",
    " ✓ src/first.test.ts (2 tests) 12ms",
    " ✓ src/second.test.ts (1 test) 4ms",
    " Test Files  2 passed (2)",
    "      Tests  3 passed (3)",
    "   Start at  12:00:00",
    "   Duration  1.20s",
    "",
  ].join("\n");

  const output = collect(input);

  expect(output.console).toContain("RUN  v5.0.0");
  expect(output.console).toContain("Test Files  2 passed");
  expect(output.console).toContain("Tests  3 passed");
  expect(output.console).toContain("Duration  1.20s");
  expect(output.console).not.toContain("src/first.test.ts");
  expect(output.console).not.toContain("src/second.test.ts");
  expect(output.persisted).toBe(redactTestLog(input));
});

test("failed Vitest output keeps the actionable failure block and persists all detail", () => {
  const input = [
    " RUN  v5.0.0 /workspace",
    " ✓ src/passing.test.ts (1 test) 4ms",
    " ❯ src/failing.test.ts (1 test | 1 failed) 20ms",
    "     × reports the failure 18ms",
    "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
    " FAIL  src/failing.test.ts > reports the failure",
    "AssertionError: expected 1 to be 2",
    "- Expected",
    "+ Received",
    "❯ src/failing.test.ts:12:18",
    " Test Files  1 failed | 1 passed (2)",
    "      Tests  1 failed | 1 passed (2)",
    "   Duration  1.40s",
    "",
  ].join("\n");

  const output = collect(input);

  expect(output.console).not.toContain("src/passing.test.ts");
  expect(output.console).toContain("src/failing.test.ts (1 test | 1 failed)");
  expect(output.console).toContain("FAIL  src/failing.test.ts > reports the failure");
  expect(output.console).toContain("AssertionError: expected 1 to be 2");
  expect(output.console).toContain("❯ src/failing.test.ts:12:18");
  expect(output.console).toContain("Test Files  1 failed | 1 passed");
  expect(output.persisted).toBe(redactTestLog(input));
});

test("VITEST_VERBOSE restores the complete sanitized console stream", () => {
  const input = [
    " ✓ src/passing.test.ts (1 test)",
    "follow this link: http://localhost/action?oobCode=secret&apiKey=fake-key",
    "",
  ].join("\n");

  const output = collect(input, true);

  expect(output.console).toContain("src/passing.test.ts");
  expect(output.console).toContain("[verification link redacted]");
  expect(output.console).not.toContain("secret");
  expect(output.persisted).toBe(output.console);
});
