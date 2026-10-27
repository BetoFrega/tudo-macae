// @ts-check
// Agent invocations: .agents/skills/kill-mutants/SKILL.md.
import { fileURLToPath } from "node:url";
import { unitMutationTierByName } from "./bin/mutationTiers.ts";

// The checker reads the harness inputs that Stryker deliberately omits from
// its sandbox. Mutants stay sandboxed; direct tests inspect the source checkout.
process.env.AGENT_HARNESS_SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "pnpm",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.mutation.pure.config.mts",
  },
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
  concurrency: "25%",
  ignorePatterns: [".claude", ".agents", ".stryker-tmp"],
  htmlReporter: { fileName: "reports/mutation-pure/mutation.html" },
  mutate: [...unitMutationTierByName.pure.mutate],
  // Measured 2026-08-28: 63.98% total / 72.59% covered (421 killed, 159
  // survived, 78 with no coverage at all), 1m12s. Most static mutants in
  // `validation.ts` stay fully measured here, but in a node-only runner where
  // environment reload is cheap. Priority-input rejection paths are exercised
  // through the package root here; successful normalization remains an
  // integration behavior because observing it requires the persisted result.
  //
  // Measured 2026-08-28 with `npx stryker run
  // stryker.pure.config.mjs --mutate
  // "packages/editorial-access/credentialValidation.ts,packages/editorial-access/activity.ts,packages/editorial-access/credentialAdministrator.ts,packages/editorial-access/credentialPolicy.ts"`:
  // 96 mutants (58 killed, 5 survived, 33 without coverage). The five policy
  // boundary survivors and the validation/capability behavior now have direct
  // ordinary tests. Zod's generated internals and the WeakMap's unreachable
  // forged-identity mutations account for the remaining no-coverage signal.
  //
  // Measured 2026-08-28 for #472 with the five affected pure files narrowed by
  // `--mutate`: 227 mutants, 79.30% total / 81.08% covered (180 killed, 42
  // survived, 5 without coverage). Ordinary tests added from that single pass
  // prove the leading-compression IPv6 /48 boundary and the new
  // `story.queueRead` activity label. `editorialCaller.ts` was included in this
  // pass, but its six survivors are observable only through a package use case
  // and are already exercised by the emulator read/audit test; the file is now
  // assigned to the integration tier. The remaining presentation survivors are
  // unchanged date parsing and labels swept in by whole-file mutation. In
  // Reproduce with:
  //
  //   pnpm run test:mutation:pure
  //
  // Measured 2026-08-29 for #473 with its five affected pure files narrowed by
  // `--mutate`: 250 mutants, 85.60% total and covered (214 killed, 36 survived,
  // none without coverage, timed out or errored). Ordinary tests added from
  // that single pass prove all Delegation activity labels, the literal 24-hour
  // boundary, accepted HTTP evidence, omitted excerpts and exact blank-URL
  // validation. The remaining survivors are unchanged whole-file presentation
  // labels and branches already triaged by this tier; mutation was not rerun.
  //
  // Measured 2026-08-29 for #545 with its five affected pure files narrowed by
  // `--mutate`: 393 mutants, 72.77% total / 76.27% covered (286 killed, 89
  // survived, 18 without coverage, none timed out or errored), 56s. Ordinary
  // tests added after that single pass prove the new catalog-read labels,
  // normalized bounded filters and cursor binding, the recommendation
  // idempotency key, and the exact queue boundaries. The remaining presentation
  // labels/date parsing are unchanged whole-file baseline. Buffer's base64url
  // representation is equivalent for the valid cursor bytes, optional-string
  // trimming is also applied by canonical URL/slug normalization, and the
  // dynamic DB getters are observable only in the integration tier. Mutation
  // was not rerun. The Route Handler cache bridge landed from the final E2E
  // regression after this pass; it is registered in the pure tier and its
  // exact tag mapping plus warmed-cache journey have ordinary tests, without
  // rerunning mutation.
  //
  // Measured 2026-08-30 for #551 with its four affected pure files narrowed
  // by `--mutate`: 202 mutants, 83.66% total / 84.08% covered (169 killed,
  // 32 survived, 1 without coverage, none timed out or errored), 9s. Ordinary
  // tests added after that single pass prove the exact lower page boundary.
  // The redundant decoded-cursor object guard exposed by five equivalent
  // survivors was removed; subsequent field validation already maps primitive
  // and null payloads to the same public cursor error. The remaining Activity
  // presentation survivors and the operations diagnostic getter are unchanged
  // whole-file baseline. Mutation was not rerun.
  //
  // Measured 2026-08-30 for #563 with the two client implementation files
  // narrowed by `--mutate`: 371 mutants, 60.65% total / 65.60% covered (214
  // killed, 11 timed out, 118 survived and 28 without coverage), 1m15s. The
  // first sandboxed start could not open Stryker's local logging socket; this
  // is the single completed report from the permitted environment retry.
  // Ordinary tests added after the pass prove local text/structured-result
  // parity, the strict diagnostic schema, the fixed canonical URL, paginated
  // tool discovery, namespace-collision refusal, trimmed and blank Delegação
  // envelopes, unknown-tool refusal, sanitized malformed and non-protocol HTTP
  // failures, structured startup recovery, and the 1Password missing-command,
  // missing-reference, empty, oversized, stderr-backpressure, timeout and retry
  // paths. The remaining reported survivors are SDK metadata/copy with no
  // authority effect, equivalent validation rewrites now covered by those
  // ordinary tests, platform-only spawn flags, or close/settlement bookkeeping
  // that has no legal post-close observation. Mutation was not rerun.
  //
  // Measured 2026-08-30 for #567 with its changed pure lines narrowed by
  // `--mutate`: 114 mutants, 78.95% total and covered (90 killed, 24 survived,
  // none without coverage, timed out or errored), 10s. Ordinary tests added
  // after the single pass prove exact text and epoch limits, every independent
  // expiry relationship, future revocation, expired validity, closed
  // capabilities and the user-facing form messages. Remaining Zod object and
  // fallback mutants are generated-schema equivalents or unreachable because
  // Zod always emits a first issue; mutation was not rerun.
  //
  // Measured 2026-08-30 for #569 with the changed pure scope narrowed to
  // `model.ts` and `saoPauloDateTime.ts`: 113 mutants, 62.83% total and
  // covered (71 killed, 42 survived, none without coverage, timed out or
  // errored). Ordinary tests added after the one report prove blank alt,
  // creator and credit; positive integer acquisition epochs; all licensed and
  // permitted evidence; caption defaulting; identifier-only trimming; and the
  // single-digit-hour datetime-local shape. Mutation was not rerun.
  //
  // Every survivor in that report is accounted for: `model.ts:4-98` consists
  // of Zod error/presentation strings, generated schema-shape replacements,
  // and the validation branches now exercised by those contract tests;
  // `saoPauloDateTime.ts:10-79` consists of Intl locale/option literals that
  // produce the same result under the explicit Sao Paulo zone, plus the hour
  // padding rule now covered directly. `mediaSearchPolicy.ts` and
  // `mediaTransitionPolicy.ts` were measured in #569's integration pass;
  // normalization, bounds, cursor binding, blank evidence and duplicate-id
  // rules are observed through that package's public search/transition seam.
  thresholds: {
    high: 80,
    low: 40,
    break: 56,
  },
};

export default config;
