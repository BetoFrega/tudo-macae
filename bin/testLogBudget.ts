import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

export type TestLogSource = "build" | "server" | "vitest" | "runner";

interface TestLogSinkOptions {
  source: TestLogSource;
  verbose?: boolean;
  summary?: { logPath: string; writeConsole?: (chunk: string) => void };
  writeConsole: (chunk: string) => void;
  writeLog?: (chunk: string) => void;
}

const BUILD_MILESTONE = /Creating an optimized production build|Compiled successfully|Finished TypeScript|✓ Generating static pages.*\(\d+\/\d+\)|Finalizing page optimization/;
const ACTIONABLE = /\b(?:ERROR|WARNING)\b|(?:^|\s)(?:Error|Warning|Failed|fatal|⨯|⚠)[:\s]/i;
const ANSI_ESCAPE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const RUNNER_PROGRESS = /^\s*(?:(?:[✓✔]|\[\d+\/\d+\])\s|(?:[✘×-]\s+\d+|\d+\))\s+.*›)/;
const VITEST_MILESTONE = /^\s*(?:RUN\b|Test Files\b|Tests\b|Start at\b|Duration\b)/;
const VITEST_FAILURE = /^\s*(?:FAIL\b|❯|×|(?:Assertion|Type)?Error:)|\bfailed\b/i;
const VITEST_FAILURE_BLOCK = /(?:Failed Tests|Unhandled Errors)|^\s*FAIL\b/;

export function redactTestLog(input: string) {
  return input
    .replace(
      /(follow this link:\s*)https?:\/\/[^\s"'<>\\]+/gi,
      "$1[verification link redacted]",
    )
    .replace(/([?&](?:oobCode|apiKey)=)[^&\s"'<>\\]+/gi, "$1[redacted]");
}

export function isRunnerTimeout(line: string) {
  const plain = line.replace(ANSI_ESCAPE, "");
  if (RUNNER_PROGRESS.test(plain)) return false;
  return /^\s*(?:Test timeout of \d+ms exceeded|TimeoutError:|Error:\s*(?:Test timeout of \d+ms exceeded|Timed out waiting \d+ms from config\.webServer|.*\bTimeout \d+ms exceeded))/i.test(plain);
}

const DIAGNOSTIC = /\b(?:ERROR|WARN(?:ING)?|FATAL)\b|\b\w*(?:Error|Warning):|(?:^|\s)(?:Failed|fatal|⨯|⚠)[:\s]/i;
const MAX_DIAGNOSTIC_GROUPS = 256;
const MAX_DIAGNOSTIC_DETAILS = 256;
const VOLATILE_FIELDS = new Set(["requestId", "correlationId", "traceId", "spanId", "timestamp", "createdAt", "time"]);

function normalizedDiagnostic(line: string) {
  function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !VOLATILE_FIELDS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]));
    }
    return value;
  }
  try {
    if (!line.trimStart().startsWith("{")) throw new SyntaxError("Unstructured diagnostic");
    return JSON.stringify(stable(JSON.parse(line)));
  }
  catch {
    return line.trim()
      .replace(/^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]?\s*/, "")
      .replace(/^\(node:\d+\)\s*/, "")
      .replace(/\b(requestId|correlationId|traceId|spanId|timestamp|createdAt)=\S+/g, "$1=<variable>");
  }
}

function diagnosticKey(line: string) {
  return createHash("sha256").update(normalizedDiagnostic(line)).digest("hex");
}

function isDiagnostic(line: string) {
  if (DIAGNOSTIC.test(line)) return true;
  if (!line.trimStart().startsWith("{")) return false;
  try {
    const event = JSON.parse(line);
    return event.outcome === "failure";
  }
  catch {
    return false;
  }
}

function isSummarizedDiagnostic(plain: string) {
  return isDiagnostic(plain) && !plain.includes("[WebServer]");
}

function shouldPrint(source: TestLogSource, line: string) {
  const plain = line.replace(ANSI_ESCAPE, "");
  if (ACTIONABLE.test(plain)) return true;
  if (source === "runner") return true;
  if (source === "build") return BUILD_MILESTONE.test(plain);
  return /Ready in/.test(plain);
}

interface DiagnosticGroup {
  headerKey: string;
  count: number;
  reported: number;
  label: string;
  prefixes: string[];
}

interface ActiveDiagnostic {
  headerKey: string;
  lines: string[];
  prefixes: string[];
  candidates: DiagnosticGroup[];
  hash: ReturnType<typeof createHash>;
  visible: boolean;
  overflow: boolean;
}

function startsNewEntry(plain: string) {
  const explicitContext = /^\s*(?:Caused by:|cause:)|^\s+at\s|^\(Use `node --trace-warnings/i.test(plain);
  return /^\s+\d+\)\s/.test(plain) || (!explicitContext && isDiagnostic(plain));
}

function continuesEntry(plain: string) {
  return /^(?:\s*$|\s+\S|Caused by:|\(Use `node --trace-warnings)/.test(plain);
}

function createDiagnosticSummary(options: TestLogSinkOptions) {
  const writeSummary = options.summary!.writeConsole ?? options.writeConsole;
  const groups = new Map<string, DiagnosticGroup>();
  let ungrouped = 0;
  let active: ActiveDiagnostic | undefined;

  function report(final = false) {
    for (const [key, group] of groups) {
      const count = group.count + (active?.prefixes.at(-1) === key ? 1 : 0);
      if (!final && count <= group.reported) continue;
      writeSummary(`[${options.source}] ${count} ${count === 1 ? "ocorrência" : "ocorrências"}: ${group.label}\n`);
      group.reported = count;
    }
  }
  const timer = setInterval(() => report(), 30_000);
  timer.unref();

  function finish() {
    if (!active) return;
    const key = active.prefixes.at(-1)!;
    const previous = groups.get(key);
    if (!active.overflow && previous) previous.count++;
    else if (!active.overflow && groups.size < MAX_DIAGNOSTIC_GROUPS) {
      if (!active.visible) options.writeConsole(active.lines.join(""));
      const origin = active.lines.find(line => /^\s+at\s/.test(line));
      const cause = active.lines.find(line => /^(?:Caused by:|\s+cause:)/i.test(line));
      const context = [origin, cause].filter(Boolean).map(line => line!.trim());
      groups.set(key, {
        headerKey: active.headerKey, count: 1, reported: 1,
        label: [active.lines[0]!.trim(), ...context].join(" — ").slice(0, 300),
        prefixes: active.prefixes,
      });
    }
    else {
      ungrouped++;
      if (!active.visible) options.writeConsole(active.lines.join(""));
    }
    active = undefined;
  }

  function revealOnOverflow(entry: ActiveDiagnostic) {
    if (entry.lines.length < MAX_DIAGNOSTIC_DETAILS) return;
    if (!entry.visible) options.writeConsole(entry.lines.join(""));
    entry.visible = true;
    entry.overflow = true;
  }

  function appendTrailer(entry: ActiveDiagnostic, sanitized: string) {
    entry.lines.push(sanitized);
    if (entry.visible) options.writeConsole(sanitized);
    revealOnOverflow(entry);
  }

  function appendDetail(entry: ActiveDiagnostic, sanitized: string, plain: string) {
    entry.hash.update("\n").update(normalizedDiagnostic(plain));
    const prefix = entry.hash.copy().digest("hex");
    entry.lines.push(sanitized);
    entry.candidates = entry.candidates.filter(group => group.prefixes[entry.prefixes.length] === prefix);
    entry.prefixes.push(prefix);
    if (!entry.visible && entry.candidates.length === 0) {
      options.writeConsole(entry.lines.join(""));
      entry.visible = true;
    }
    else if (entry.visible) options.writeConsole(sanitized);
    revealOnOverflow(entry);
  }

  return {
    finish,
    diagnostic(sanitized: string, plain: string) {
      const headerKey = diagnosticKey(plain);
      const hash = createHash("sha256").update(normalizedDiagnostic(plain));
      const candidates = [...groups.values()].filter(group => group.headerKey === headerKey);
      active = {
        headerKey, hash, candidates, lines: [sanitized],
        prefixes: [hash.copy().digest("hex")],
        visible: Boolean(options.verbose || candidates.length === 0), overflow: false,
      };
      if (active.visible) options.writeConsole(sanitized);
    },
    continuation(sanitized: string, plain: string) {
      if (startsNewEntry(plain) || !active || !continuesEntry(plain)) return false;
      if (active.overflow) options.writeConsole(sanitized);
      else if (/^\s*$|^\(Use `node --trace-warnings/.test(plain)) appendTrailer(active, sanitized);
      else appendDetail(active, sanitized, plain);
      return true;
    },
    end(incomplete: boolean) {
      clearInterval(timer);
      finish();
      if (incomplete) writeSummary(`[${options.source}] Resumo incompleto\n`);
      report(true);
      if (ungrouped > 0) writeSummary(`[${options.source}] ${ungrouped} ocorrências adicionais sem agrupamento (limite ${MAX_DIAGNOSTIC_GROUPS})\n`);
      writeSummary(`Log completo: ${options.summary!.logPath}\n`);
    },
  };
}

export function createTestLogSink(options: TestLogSinkOptions) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let vitestFailureDetails = false;
  let ended = false;
  const summary = options.summary ? createDiagnosticSummary(options) : undefined;

  function emit(raw: string) {
    const sanitized = redactTestLog(raw);
    options.writeLog?.(sanitized);
    const plain = sanitized.replace(ANSI_ESCAPE, "");
    if (options.source === "vitest" && VITEST_FAILURE_BLOCK.test(plain)) {
      vitestFailureDetails = true;
    }
    if (options.source === "runner" && RUNNER_PROGRESS.test(plain)) {
      summary?.finish();
      options.writeConsole(sanitized);
      return;
    }
    emitClassified(sanitized, plain);
  }

  function emitClassified(sanitized: string, plain: string) {
    if (summary?.continuation(sanitized, plain)) return;
    summary?.finish();
    const visible = isVisible(sanitized, plain);
    if (summary && visible && isSummarizedDiagnostic(plain)) {
      summary.diagnostic(sanitized, plain);
      return;
    }
    if (options.verbose || visible) {
      options.writeConsole(sanitized);
    }
  }

  function isVisible(sanitized: string, plain: string) {
    if (options.source === "vitest") {
      return vitestFailureDetails || VITEST_MILESTONE.test(plain) || VITEST_FAILURE.test(plain);
    }
    return shouldPrint(options.source, sanitized)
      || Boolean(options.summary && isDiagnostic(plain));
  }

  return {
    write(chunk: string | Uint8Array) {
      if (ended) return;
      pending += typeof chunk === "string" ? decoder.end() + chunk : decoder.write(Buffer.from(chunk));
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        emit(pending.slice(0, newline + 1));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    },
    end(status: { incomplete?: boolean } = {}) {
      if (ended) return;
      ended = true;

      pending += decoder.end();
      if (pending !== "") emit(pending);
      pending = "";
      summary?.end(status.incomplete ?? false);
    },
  };
}
