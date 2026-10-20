import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

function run(checks: string, production: string, existing = false, workers = "success") {
  const directory = mkdtempSync(join(tmpdir(), "deployment-ticket-"));
  try {
    const shim = join(directory, "gh");
    const calls = join(directory, "calls.jsonl");
    writeFileSync(shim, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(process.env.TICKET_CALLS,JSON.stringify(process.argv.slice(2))+'\\n');console.log(process.argv.includes('--paginate')?JSON.stringify([[${existing ? JSON.stringify({ number: 42, user: { login: "github-actions[bot]" }, body: "<!-- production-delivery-blocked -->" }) : ""}]]):'{}');`);
    chmodSync(shim, 0o755);
    execFileSync(process.execPath, [resolve("bin/deployment-ticket.mjs")], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, TICKET_CALLS: calls,
        GITHUB_REPOSITORY: "BetoFrega/tudo-macae", GITHUB_RUN_ID: "123", RELEASE_SHA: "a".repeat(40), CHECKS_RESULT: checks, PRODUCTION_RESULT: production, WORKERS_RESULT: workers },
    });
    return readFileSync(calls, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
  }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

test.skipIf(inWorkers)("creates a correction ticket when checks block deployment", () => {
  const calls = run("failure", "skipped");
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain("labels[]=needs-triage");
  const request = calls[1]?.join(" ");
  expect(request).toContain("actions/runs/123");
  expect(request).toContain("rótulo `no-issue`");
  expect(request).toContain("causa concreta");
  expect(request).toContain("ligada a este ticket");
  expect(request).toContain("Repairs delivery #");
  expect(request).toContain("permanece aberto");
  expect(request).toContain("restaure a entrega da `main`");
  expect(request).toContain("produto, nos testes, no harness ou no pipeline");
  expect(request).toContain("docs/agents/production-delivery.md");
});

test.skipIf(inWorkers)("updates the existing blocker without closing it when production fails", () => {
  const calls = run("success", "failure", true);
  expect(calls).toHaveLength(3);
  expect(calls[1]).toContain("repos/BetoFrega/tudo-macae/issues/42/comments");
  const request = calls[1]?.join(" ");
  expect(request).toContain("rótulo `no-issue`");
  expect(request).toContain("aplique explicitamente");
  expect(request).toContain("Inspecione os passos e artifacts desta execução");
  expect(request).toContain("causa concreta");
  expect(request).toContain("ligada a este ticket");
  expect(request).toContain("Repairs delivery #");
  expect(request).toContain("permanece aberto");
  expect(request).toContain("restaure a entrega da `main`");
  expect(request).toContain("produto, nos testes, no harness ou no pipeline");
  expect(request).toContain("Production delivery");
  expect(request).toContain("production-delivery.md");
  expect(request).not.toContain("PRs comuns continuam bloqueadas");
  expect(calls.flat()).not.toContain("state=closed");
});

test.skipIf(inWorkers)("keeps a blocker open when Workers fail after the API Worker publish", () => {
  const calls = run("success", "success", true, "failure");
  expect(calls.flat()).not.toContain("state=closed");
  expect(calls[1]?.join(" ")).toContain("API Worker: success. Workers: failure");
  expect(calls[1]?.join(" ")).toContain("workers-recovery");
});

test.skipIf(inWorkers)("closes a blocker only when checks, the API Worker and Workers pass", () => {
  const calls = run("success", "success", true);
  expect(calls.flat()).toContain("state=closed");
  expect(calls.flat().join(" ")).not.toContain("no-issue");
  expect(run("success", "success")).toHaveLength(1);
});
