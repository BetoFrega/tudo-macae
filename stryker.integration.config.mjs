// @ts-check
// Agent invocations: .agents/skills/kill-mutants/SKILL.md.
import { integrationMutationScope } from "./bin/integrationMutationTier.ts";
/**
 * Mutation testing over the integration tier — the files that only
 * `*.integration.test.ts` covers, and that the unit-tier configs therefore
 * cannot reach. Run it with `npm run test:mutation:integration -- --mutate ...`
 * as `.agents/skills/kill-mutants/SKILL.md` documents.
 *
 * Separate from the unit-tier configs (`stryker.pure.config.mjs` and
 * `stryker.component.config.mjs`) because the runners are incompatible: this
 * one is node and `concurrency: 1` is mandatory — the integration suites run
 * with `fileParallelism: false`, and parallel Stryker test runners would share
 * their fixtures' state and overwrite each other's records.
 *
 * This comment is the canonical record of what the tier costs and why it is
 * believed safe; the mutation skill points here rather than restating it.
 *
 * `npm run test:mutation:integration` runs Stryker through
 * `bin/test-integration.mjs`, which starts the API Worker fixture these suites
 * need; `npx stryker run` alone lacks it and fails the dry run.
 *
 * **A test here must never assert on the contents of a whole collection.** A
 * mutant that skips a validation writes the very record the assertion says
 * should not exist into the shared fixture, where it stays, so the assertion
 * passes once and fails every run after. Address a record by an id unique to
 * the run, or assert only the refusal.
 */
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.mutation.integration.config.mts",
  },
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
  concurrency: 1,
  // Stryker's default (5s + 1.5x the baseline run) is tuned for hermetic
  // tests. Every test here makes database round-trips, so a slow runner could
  // let a healthy mutant outlast the default. Nothing has timed out on either
  // CI or local — this is headroom that keeps a slow day from reading as a
  // score change, not a fix for an observed problem.
  timeoutMS: 30000,
  ignorePatterns: [".claude", ".agents", ".stryker-tmp"],
  htmlReporter: { fileName: "reports/mutation-integration/mutation.html" },
  mutate: [...integrationMutationScope],
  // No recorded measurement covers the current scope; record one here, with
  // its command and date, before treating `break` as calibrated.
  thresholds: {
    high: 80,
    low: 40,
    break: 70,
  },
};

export default config;
