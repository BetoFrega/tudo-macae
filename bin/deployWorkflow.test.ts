import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { parse } from "yaml";

// These tests run real processes, which the Workers runtime (quality-flare's Tests check) lacks.
const inWorkers = globalThis.navigator?.userAgent === "Cloudflare-Workers";

const workflow = parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
test("delivers every main push or a manual dispatch and preserves active delivery", () => {
  expect(workflow.on.push).toEqual({ branches: ["main"] });
  expect(workflow.on.pull_request).toBeUndefined();
  expect(workflow.on.workflow_dispatch.inputs.sha).toMatchObject({
    required: false,
    type: "string",
  });
  expect(workflow.concurrency).toEqual({ "group": "production-delivery", "queue": "max", "cancel-in-progress": false });
  expect(workflow.jobs.checks.permissions).toBeUndefined();
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(JSON.stringify(workflow.jobs.checks)).not.toMatch(/secrets\.|id-token|google-github-actions/);
});
test("checks every Worker app, not only the affected ones, before production mutation", () => {
  const runs = workflow.jobs.checks.steps.map((step: { run?: string }) => step.run ?? "").join("\n");
  expect(runs).toContain("npx turbo run typecheck build test --filter='!//' --filter='!@tudomacae/e2e' --filter='!./packages/*' --only");
  expect(runs).not.toContain("--affected");
  // node:test suites sit outside turbo's test tasks.
  expect(runs).toContain("node --test apps/public-images/deploy.test.mjs");
});
test.skipIf(inWorkers)("selects the dispatched SHA before checkout without repository credentials", () => {
  const checkout = workflow.jobs.checks.steps.find(
    (step: { uses?: string }) => step.uses?.startsWith("actions/checkout"),
  );
  const candidate = workflow.jobs.checks.steps.find(
    (step: { name?: string }) => step.name === "Fix the candidate for this run",
  );
  const directory = mkdtempSync(path.join(tmpdir(), "deploy-candidate-"));
  const output = path.join(directory, "output");
  const defaultSha = "a".repeat(40);

  try {
    expect(candidate.env.DEFAULT_SHA).toBe("${{ github.sha }}");
    expect(candidate.env.REQUESTED_SHA).toBe("${{ inputs.sha }}");
    execFileSync("bash", ["-c", candidate.run], {
      cwd: directory,
      env: {
        ...process.env,
        DEFAULT_SHA: defaultSha,
        GITHUB_OUTPUT: output,
        REQUESTED_SHA: "",
      },
      stdio: "pipe",
    });

    expect(readFileSync(output, "utf8")).toBe(`sha=${defaultSha}\n`);
    expect(checkout.with.ref).toBe("${{ steps.candidate.outputs.sha }}");
  }
  finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("checks domain protection against the selected revision's history when main advances", () => {
  const lint = workflow.jobs.checks.steps.find(
    (step: { run?: string }) => step.run === "npm run lint",
  );
  expect(lint.env.DOMAIN_SEAMS_BASE).toBe("${{ steps.candidate.outputs.sha }}^");
  const eligibility = workflow.jobs.checks.steps.find(
    (step: { name?: string }) => step.name === "Require a SHA already on main",
  );
  expect(eligibility.run).toContain("git merge-base --is-ancestor \"$SHA\" origin/main");
  expect(workflow.jobs.production.needs).toEqual(["checks"]);
});
test("runs the complete E2E collection in checks, never with production access", () => {
  const steps = workflow.jobs.checks.steps as Array<{ run?: string }>;
  expect(steps.some(step => step.run === "npm run test:e2e:full -- --max-failures=1")).toBe(true);
  const mutation = JSON.stringify([workflow.jobs.production, workflow.jobs.workers]);
  expect(mutation).not.toMatch(/playwright|test:e2e|test:harness|chromium/);
});
test("runs fail-fast Vitest and the application build before production mutation", () => {
  const steps = workflow.jobs.checks.steps as Array<{ run?: string; uses?: string }>;
  const unit = steps.findIndex(step => step.run === "npm test -- --tier=unit --bail=1");
  const integration = steps.findIndex(step => step.run === "npm test -- --tier=integration --bail=1 && npm run build:check");
  expect(unit).toBeGreaterThan(-1);
  expect(unit).toBeLessThan(integration);
  expect(JSON.stringify(steps)).not.toMatch(/setup-java|emulators/);
  expect(workflow.jobs.production.needs).toEqual(["checks"]);
  const diagnostics = workflow.jobs.checks.steps.find(
    (step: { name?: string }) => step.name === "Retain sanitized test diagnostics",
  );
  expect(diagnostics.if).toBe("always()");
  expect(diagnostics.with.path).toBe("test-results/vitest-logs/");
});
test("typechecks immediately after dependency installation and before expensive setup", () => {
  const steps = workflow.jobs.checks.steps as Array<{ run?: string }>;
  const installDependencies = steps.findIndex(step => step.run === "npm ci");
  const typecheck = steps.findIndex(step => step.run === "npm run typecheck");
  const lint = steps.findIndex(step => step.run === "npm run lint");
  const workerTests = steps.findIndex(step => step.run === "npm run test:worker");
  const integration = steps.findIndex(step => step.run?.includes("--tier=integration"));

  expect(typecheck).toBe(installDependencies + 1);
  expect(typecheck).toBeLessThan(lint);
  expect(typecheck).toBeLessThan(workerTests);
  expect(typecheck).toBeLessThan(integration);
});
test("builds the web Worker candidate before any production mutation", () => {
  const steps = workflow.jobs.checks.steps as Array<{ name?: string; run?: string }>;
  const typecheck = steps.findIndex(step => step.run === "npm run typecheck");
  const webBuild = steps.findIndex(step => step.name === "Build web Worker before production mutation");
  expect(webBuild).toBe(typecheck + 1);
  expect(steps[webBuild].run).toContain("CLOUDFLARE_ENV=production WEB_ASSET_RELEASE=\"$RELEASE_SHA\" npx vite build --config vite.vinext.config.ts");
  expect(steps[webBuild].run).toContain("rm -rf .wrangler/deploy");
  expect(workflow.jobs.production.needs).toEqual(["checks"]);
});
test("requires checks and pins production checkout to their SHA", () => {
  expect(workflow.jobs.production.needs).toEqual(["checks"]);
  expect(workflow.jobs.production.steps[0].with.ref).toBe("${{ needs.checks.outputs.sha }}");
  expect(workflow.jobs.outcome.if).toContain("always()");
});
test("publishes Workers only after the same SHA passes checks and the API Worker publish", () => {
  const job = workflow.jobs.workers;
  expect(job.needs).toEqual(["checks", "production"]);
  expect(job.environment).toBe("cloud-run-production");
  expect(job.steps[0].with.ref).toBe("${{ needs.checks.outputs.sha }}");
  expect(job.env.RELEASE_SHA).toBe("${{ needs.checks.outputs.sha }}");
  expect(job.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
  const publish = job.steps.find((step: { run?: string }) => step.run === "node bin/deploy-workers-production.mjs");
  expect(publish.env.CLOUDFLARE_API_TOKEN).toBe("${{ secrets.CLOUDFLARE_API_TOKEN }}");
  expect(workflow.jobs.outcome.needs).toEqual(["checks", "production", "workers"]);
  const ticket = workflow.jobs.outcome.steps.find((step: { run?: string }) => step.run === "node bin/deployment-ticket.mjs");
  expect(ticket.env.WORKERS_RESULT).toBe("${{ needs.workers.result }}");
});
test("publishes the API Worker after D1 readiness", () => {
  const steps = workflow.jobs.production.steps as Array<{ name?: string; run?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, string> }>;
  const ready = steps.findIndex(step => step.name === "Require production D1 migrations ready");
  const publish = steps.findIndex(step => step.run === "node bin/deploy-api-worker-production.mjs");
  const recovery = steps[publish + 1];
  expect(publish).toBeGreaterThan(ready);
  expect(recovery).toMatchObject({ if: "always()", with: { path: "${{ runner.temp }}/api-worker-recovery.json" } });
  expect(steps[publish].env).toMatchObject({
    CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
    AUTHENTICATION_RUNTIME_ACCOUNT: "${{ env.RUNTIME_ACCOUNT }}",
    TURNSTILE_ENFORCEMENT: "${{ vars.TURNSTILE_ENFORCEMENT }}",
    PUBLIC_ARTICLE_INDEX_SERVICE: "tudo-macae-public-article-index",
  });
  const ids = ["AUTHENTICATION_D1_ID", "CLASSIFIEDS_D1_ID", "EDITORIAL_D1_ID"].map(name => steps[publish].env?.[name]);
  expect(new Set(ids).size).toBe(3);
  const support = workflow.jobs.checks.steps.find((step: { name?: string }) => step.name === "Require API Worker delivery support in the selected SHA");
  expect(support.run).toBe("test -f bin/deploy-api-worker-production.mjs");
});
test("rejects a selected main ancestor without Worker delivery before any production job", () => {
  const steps = workflow.jobs.checks.steps as Array<{ name?: string; run?: string }>;
  const selectedSha = steps.findIndex(step => step.name === "Require a SHA already on main");
  const workerSupport = steps.findIndex(step => step.name === "Require Worker delivery support in the selected SHA");
  expect(workerSupport).toBe(selectedSha + 1);
  expect(steps[workerSupport].run).toBe("test -f bin/deploy-workers-production.mjs");
  expect(workflow.jobs.production.needs).toEqual(["checks"]);
});
test("reports a rejected candidate from the trusted workflow SHA", () => {
  expect(workflow.jobs.outcome.steps[0].with.ref).toBe("${{ github.sha }}");
  const ticket = workflow.jobs.outcome.steps.find(
    (step: { name?: string }) => step.name === "Update the delivery correction ticket",
  );
  expect(ticket.env.RELEASE_SHA).toBe("${{ needs.checks.outputs.sha || github.sha }}");
});

test("production no longer builds or promotes Cloud Run", () => {
  const job = workflow.jobs.production;
  expect(job.environment).toBe("cloud-run-production");
  expect(job.permissions).toEqual({ contents: "read" });
  expect(JSON.stringify(workflow.jobs)).not.toMatch(/google-github-actions|cloud-run-candidate|deploy-cloud-run-production|cloud-run-provider-preflight/);
  expect(workflow.jobs["provider-preflight"]).toBeUndefined();
});

test("blocks delivery when production D1 migrations are pending", () => {
  const steps = workflow.jobs.production.steps as Array<{ name?: string; run?: string; env?: Record<string, string> }>;
  const preflight = steps.findIndex(step => step.name === "Require production D1 migrations ready");
  const publish = steps.findIndex(step => step.run === "node bin/deploy-api-worker-production.mjs");
  expect(preflight).toBeGreaterThan(0);
  expect(preflight).toBeLessThan(publish);
  expect(steps[preflight].run).toContain("d1 migrations list DB --remote");
  expect(steps[preflight].run).toContain("No migrations to apply!");
  expect(steps[preflight].run).toContain("test -n \"$CLOUDFLARE_ZONE_ID\"");
  expect(steps[preflight].env?.CLOUDFLARE_API_TOKEN).toBe("${{ secrets.CLOUDFLARE_API_TOKEN }}");
  expect(workflow.jobs.production.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
});

test("checks Worker runtime contracts before production mutation", () => {
  const steps = workflow.jobs.checks.steps as Array<{ run?: string }>;
  expect(steps.some(step => step.run === "npm run test:worker")).toBe(true);
});

test("the Checks workflow runs type, lint, Worker candidates and the unit tier on every pull request", () => {
  const { jobs } = parse(readFileSync(".github/workflows/checks.yml", "utf8"));
  const runs = (name: string) => jobs[name].steps.flatMap((step: { run?: string }) => step.run ? [step.run] : []).join("\n");
  expect(runs("typecheck")).toBe("npm run typecheck");
  expect(runs("lint")).toBe("npm run lint");
  // PRs compare against the base branch, so turbo checks only the affected apps.
  expect(jobs.workers.env.TURBO_SCM_BASE).toBe("origin/${{ github.base_ref }}");
  expect(runs("workers")).toContain("npx turbo run typecheck build --affected");
  // The root Typecheck job covers packages/; Web Workers type-checks only the apps.
  expect(runs("workers")).toContain("--filter='!./packages/*' --only");
  expect(runs("workers")).toContain("npx turbo run test --affected");
  expect(runs("workers")).toContain("npm run test:worker -- bin/workerSetup.runtime.test.ts bin/articleIndexConsumer.runtime.test.ts");
  // bin/ tests (deploy scripts included) run in the unit tier, so Web Workers doesn't repeat them.
  expect(runs("workers")).not.toContain("vitest.unit.config.mts");
  expect(runs("unit")).toBe("npm run test:unit -- --shard=${{ matrix.shard }}/2");
});

test("the Checks workflow keeps the lint and typecheck caches between runs", () => {
  const { jobs } = parse(readFileSync(".github/workflows/checks.yml", "utf8"));
  const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));
  const cached = (name: string) => jobs[name].steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/cache")).with.path;
  // Content, not mtime: every run is a fresh clone. Type-aware lint rules would need a project-wide key instead.
  expect(scripts.lint).toContain("eslint . --cache --cache-strategy content --cache-location node_modules/.cache/eslint/");
  expect(cached("lint")).toBe("node_modules/.cache/eslint");
  expect(cached("typecheck")).toBe("tsconfig.tsbuildinfo");
});
