import { expect, test, vi } from "vitest";
import { createTestLogSink } from "./testLogBudget";

test("prints the first diagnostic immediately and summarizes twenty occurrences", () => {
  const console: string[] = [];
  const persisted: string[] = [];
  const sink = createTestLogSink({
    source: "server",
    summary: { logPath: ".next/e2e-server.log" },
    writeConsole: chunk => console.push(chunk),
    writeLog: chunk => persisted.push(chunk),
  });
  sink.write("Error: media download failed\n");
  expect(console.join("")).toBe("Error: media download failed\n");
  for (let index = 1; index < 20; index++) sink.write("Error: media download failed\n");
  expect(console.join("")).toBe("Error: media download failed\n");
  sink.end();
  expect(console.join("")).toContain("20 ocorrências: Error: media download failed");
  expect(console.join("")).toContain(".next/e2e-server.log");
  expect(persisted).toHaveLength(20);
});

test("groups request and time variations without merging different operations or listener events", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk),
  });
  sink.write("{\"severity\":\"ERROR\",\"message\":\"download failed\",\"operation\":\"preview\",\"requestId\":\"a\",\"createdAt\":1}\n");
  sink.write("{\"createdAt\":2,\"requestId\":\"b\",\"operation\":\"preview\",\"message\":\"download failed\",\"severity\":\"ERROR\"}\n");
  expect(console).toHaveLength(1);
  sink.write("{\"severity\":\"ERROR\",\"message\":\"download failed\",\"operation\":\"enlargement\",\"requestId\":\"c\",\"createdAt\":3}\n");
  sink.write("(node:1) MaxListenersExceededWarning: 11 error listeners added to [PassThrough]\n");
  sink.write("(node:1) MaxListenersExceededWarning: 11 close listeners added to [PassThrough]\n");
  expect(console).toHaveLength(4);
  sink.end();
  expect(console.join("")).toContain("2 ocorrências: {\"severity\":\"ERROR\"");
});

test("reports growing counts every thirty seconds and flushes an incomplete summary once", () => {
  vi.useFakeTimers();
  try {
    const console: string[] = [];
    const sink = createTestLogSink({
      source: "server", summary: { logPath: "server.log" },
      writeConsole: chunk => console.push(chunk),
    });
    sink.write("Error: request failed\n");
    vi.advanceTimersByTime(30_000);
    expect(console).toHaveLength(1);
    sink.write("Error: request failed\n");
    vi.advanceTimersByTime(29_999);
    expect(console).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(console.join("")).toContain("2 ocorrências");
    const length = console.length;
    vi.advanceTimersByTime(30_000);
    expect(console).toHaveLength(length);
    sink.end({ incomplete: true });
    expect(console.join("")).toContain("Resumo incompleto");
    expect(console.join("")).toContain("Log completo: server.log");
    const endedLength = console.length;
    sink.end();
    vi.advanceTimersByTime(60_000);
    expect(console).toHaveLength(endedLength);
  }
  finally {
    vi.useRealTimers();
  }
});

test("retains stack context and new diagnostic origins without replaying identical blocks", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk),
  });
  const block = "Error: request failed\n    at preview (media.ts:10:2)\n  cause: socket closed\n";
  sink.write(block);
  expect(console.join("")).toBe(block);
  sink.write(block);
  expect(console.join("")).toBe(block);
  sink.write("Error: request failed\n    at enlargement (media.ts:30:2)\n");
  expect(console.join("")).toContain("at enlargement (media.ts:30:2)");
  sink.end();
  expect(console.join("")).toContain("2 ocorrências: Error: request failed — at preview (media.ts:10:2)");
  expect(console.join("")).toContain("1 ocorrência: Error: request failed — at enlargement (media.ts:30:2)");
});

test("sanitizes warnings in the console, the log, verbose output and summaries", () => {
  const console: string[] = [];
  const persisted: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk), writeLog: chunk => persisted.push(chunk),
  });
  sink.write("Warning: unexpected 403 from media preview?oobCode=example&apiKey=example\n");
  expect(console.join("")).toContain("unexpected 403");
  expect(console.join("")).not.toContain("=example");
  sink.end();
  expect(console.join("")).not.toContain("=example");
  expect(persisted.join("")).toContain("unexpected 403");
  const verbose: string[] = [];
  const detailed = createTestLogSink({
    source: "server", verbose: true, summary: { logPath: "server.log" },
    writeConsole: chunk => verbose.push(chunk),
  });
  detailed.write("Error: download?oobCode=example\nError: download?oobCode=example\n");
  detailed.end();
  expect(verbose.join("").match(/^Error: download/gm)).toHaveLength(2);
  expect(verbose.join("")).not.toContain("=example");
});

test("keeps novel diagnostics visible when the bounded grouping budget is exhausted", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk),
  });
  for (let index = 0; index < 260; index++) sink.write(`Error: unique failure ${index}\n`);
  expect(console).toHaveLength(260);
  sink.end();
  expect(console.some(chunk => chunk.includes("4 ocorrências adicionais sem agrupamento"))).toBe(true);
});

test("keeps distinct chained causes and their stacks in separate groups", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk),
  });
  const first = "Error: request failed\n    at preview (media.ts:10:2)\nCaused by: Error: socket closed\n    at connect (socket.ts:20:1)\n";
  const second = first.replace("socket closed", "permission denied");
  sink.write(first);
  sink.write(first);
  expect(console.join("")).toBe(first);
  sink.write(second);
  expect(console.join("")).toBe(first + second);
  sink.end();
  expect(console.some(line => line.includes("2 ocorrências") && line.includes("socket closed"))).toBe(true);
  expect(console.some(line => line.includes("1 ocorrência") && line.includes("permission denied"))).toBe(true);
});

test("groups ISO timestamp prefixes while preserving the first request context", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk),
  });
  sink.write("[2026-10-04T10:00:00Z] Error: download failed requestId=a\n");
  sink.write("[2026-10-04T10:00:01Z] Error: download failed requestId=b\n");
  expect(console).toHaveLength(1);
  expect(console[0]).toContain("requestId=a");
  sink.end();
  expect(console.some(line => line.includes("2 ocorrências"))).toBe(true);
});

test("aggregates structured operational failures without requiring an ERROR severity", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "runner", summary: { logPath: "playwright.log" },
    writeConsole: chunk => console.push(chunk),
  });
  sink.write("{\"event\":\"public_article_index_failure\",\"outcome\":\"failure\",\"operation\":\"distribution\",\"correlationId\":\"a\"}\n");
  sink.write("{\"event\":\"public_article_index_failure\",\"outcome\":\"failure\",\"operation\":\"distribution\",\"correlationId\":\"b\"}\n");
  expect(console).toHaveLength(1);
  sink.end();
  expect(console.some(line => line.includes("2 ocorrências"))).toBe(true);
});

test("counts a Node warning with and without its one-time trace hint as the same cause", () => {
  const console: string[] = [];
  const sink = createTestLogSink({
    source: "server", summary: { logPath: "server.log" },
    writeConsole: chunk => console.push(chunk),
  });
  const warning = "(node:1) MaxListenersExceededWarning: 11 error listeners added to [PassThrough]\n";
  sink.write(warning + "(Use `node --trace-warnings ...` to show where the warning was created)\n");
  sink.write(warning);
  expect(console).toHaveLength(2);
  sink.end();
  expect(console.filter(line => line.includes("ocorrência"))).toHaveLength(1);
  expect(console.some(line => line.includes("2 ocorrências"))).toBe(true);
});

test("retains blank-separated assertion details and distinguishes their origins", () => {
  const output: string[] = [];
  const sink = createTestLogSink({
    source: "runner", summary: { logPath: "playwright.log" },
    writeConsole: chunk => output.push(chunk),
  });
  const first = "Error: expect(locator).toBeVisible() failed\n\n    Expected: visible\n\n    at first (first.spec.ts:10:2)\n";
  const second = first.replace("first (first.spec.ts:10:2)", "second (second.spec.ts:20:2)");
  sink.write(first);
  sink.write(first);
  expect(output.join("")).toBe(first);
  sink.write(second);
  expect(output.join("")).toBe(first + second);
  sink.end();
  expect(output.some(line => line.includes("2 ocorrências") && line.includes("first.spec.ts"))).toBe(true);
  expect(output.some(line => line.includes("1 ocorrência") && line.includes("second.spec.ts"))).toBe(true);
});

test("groups the same Node warning across worker PIDs while retaining listener events", () => {
  const output: string[] = [];
  const log: string[] = [];
  const sink = createTestLogSink({
    source: "runner", summary: { logPath: "playwright.log" },
    writeConsole: chunk => output.push(chunk), writeLog: chunk => log.push(chunk),
  });
  sink.write("(node:101) MaxListenersExceededWarning: 11 error listeners added to [PassThrough]\n");
  sink.write("(node:202) MaxListenersExceededWarning: 11 error listeners added to [PassThrough]\n");
  sink.write("(node:202) MaxListenersExceededWarning: 11 close listeners added to [PassThrough]\n");
  sink.end();
  expect(output.join("").match(/^\(node:.*error listeners/gm)).toHaveLength(1);
  expect(output.some(line => line.includes("2 ocorrências") && line.includes("error listeners"))).toBe(true);
  expect(output.some(line => line.includes("1 ocorrência") && line.includes("close listeners"))).toBe(true);
  expect(log.join("")).toContain("(node:202)");
});

test("separates consecutive indented Playwright failures without separating chained causes", () => {
  const output: string[] = [];
  const sink = createTestLogSink({
    source: "runner", summary: { logPath: "playwright.log" },
    writeConsole: chunk => output.push(chunk),
  });
  const first = "  1) [chromium] first test\n\n    Error: assertion failed\n\n      at first (first.spec.ts:10:2)\n    cause: Error: socket closed\n";
  const second = "  2) [chromium] second test\n\n    Error: assertion failed\n\n      at second (second.spec.ts:20:2)\n";
  sink.write(first);
  sink.write(second);
  sink.write(second.replace("2)", "3)"));
  sink.end();
  expect(output.some(line => line.includes("1 ocorrência") && line.includes("first.spec.ts") && line.includes("socket closed"))).toBe(true);
  expect(output.some(line => line.includes("2 ocorrências") && line.includes("second.spec.ts"))).toBe(true);
});

test("keeps successful reporter titles out of diagnostic summaries", () => {
  const output: string[] = [];
  const sink = createTestLogSink({
    source: "runner", summary: { logPath: "playwright.log" },
    writeConsole: chunk => output.push(chunk),
  });
  const progress = "  ✓ 1 shows error: validation message\n[2/2] handles TimeoutError: fallback\n  - 3 [chromium] › skipped error: case\n  ✘ 4 [chromium] › failed Error: case\n  1) [chromium] › title Error: case\n";
  sink.write(progress);
  sink.end();
  expect(output.join("")).toContain(progress);
  expect(output.some(line => line.includes("ocorrência"))).toBe(false);
});
