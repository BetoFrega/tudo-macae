---
name: kill-mutants
description: Explore additional behavioural coverage with an optional, focal mutation pass when its likely value justifies its cost.
---

# Kill Mutants

Treat the mutation report as **signal**, not score. Start with the observable
behaviour a changed line protects; a test earns its place by proving that
behaviour.

Mutation is optional, including after review and implementation. Omission is
not failure, debt, a delivery caveat or a completion blocker. Ordinary tests and
review provide acceptance evidence; mutation guides additional coverage. Each
mutant multiplies suite executions, potentially making startup and fixture I/O
disproportionately expensive.

Before opting in, consider historical duration in the tier config, estimated
mutant count, environmental dependencies and likely discovery value. If the
predicted duration is excessive for the change, skip it, briefly record why,
and complete the ordinary checks. Aggregate commands and complete tiers require
an explicit human request for a broad investigation.

## Single optional pass

1. **Prepare the complete scope.** From the review's fixed point, account for every
   changed production file with runtime behaviour. Exclude text, type-only code,
   generated output, mechanical edits, static markup and trivial glue; record why
   each exclusion has no observable rule to test. Classify the remaining files by
   the project's ordinary test tiers.

   Record the resolved review base SHA. Enumerate committed and pending changes with
   `git diff --name-status <base>` and inspect `git diff --unified=0 <base>`;
   include new files from `git ls-files --others --exclude-standard`. Account for
   deleted files as removals with no remaining code to mutate; use current paths for
   renames. Record each file's tier and explicit paths or new-side line ranges, or
   its exclusion reason. If all files are excluded, report that inventory and stop
   without starting Stryker.

   Resolve the `mutate` patterns (including exclusions) exported by
   `stryker.pure.config.mjs`, `stryker.component.config.mjs` and
   `stryker.integration.config.mjs`. These configs, including their imported tier
   definitions, own membership, tests, environment, concurrency and reporters.
   Every remaining file must match **exactly one** tier: zero matches or overlap
   blocks execution. Add a missing file to one appropriate tier and resolve any
   overlap before continuing. Never replace a config's full scope with this diff.

2. **Run once per affected tier.** Build a comma-separated list of literal changed
   paths or ranges for each nonempty tier; quote the entire argument. Expand no
   directory or tier globs: unchanged neighboring files stay outside the invocation.
   `--mutate` overrides the configured scope, so check every argument against the
   inventory before starting. Use only the applicable forms below, replacing the
   sample paths with that tier's complete inventory:

   ```bash
   pnpm run test:mutation:pure --mutate 'packages/text-normalization/slugify.ts'
   pnpm run test:mutation:component --mutate 'src/features/navigation/UserSidebar.tsx:24-28,src/features/navigation/UserSidebar.tsx:30-37'
   pnpm run test:mutation:integration --mutate 'src/packages/demo-seed/lib/environment.ts'
   ```

   Inspect the selected config for prerequisites and report location. Integration
   starts from a green ordinary integration suite; retain the config's environment and
   concurrency requirements. Do not start empty
   tiers. The aggregate `pnpm run test:mutation` and tier commands without `--mutate`
   are full-scope runs reserved for an explicit human request for a broad investigation.

   Save the actual arguments, report location and elapsed time; compare with a
   dated historical full-tier measurement in the config, without rerunning the
   full tier just to obtain a comparison.

   A failure without a report permits one retry after a concrete environmental cause
   is repaired. A second failure ends the run with that tier blocked. Once a report
   exists, even an exit below `thresholds.break` completes that tier's pass.

3. **Triage every survivor and uncovered mutant.** For each one, decide: real
   rule, or noise.

   **Test it** — the mutant changed behaviour a caller could observe and
   depend on:
   - a boundary condition (`>` vs `>=`, an off-by-one, a length check)
   - a branch that changes the returned value or thrown error
   - a domain invariant (a status transition, a validation rule, a merge/
     dedup rule)

   **Leave it** — the mutant is noise, not a gap:
   - a log message string (`console.error("", error)`) — nobody asserts on
     log text, and if they should, that's a separate, deliberate decision
   - a mutation inside truly dead or trivial glue code (a one-line wrapper
     around a library call with no branching of its own)
   - a mutant equivalent to the original under every real input (rare —
     verify before claiming this; it's the excuse laziness reaches for)

   Account for every entry with its file, line, mutation, observable rule or reason
   to leave it. Ask the user when that classification remains uncertain.

4. **Select useful tests.** When the task authorizes test additions, implement the
   tests for real gaps together after triage; otherwise, present them for approval
   first.

5. **Write behavioural tests, not kill-confirmation tests.** Each test must
   assert on an observable output or thrown error tied to the rule — not
   that a function "was called" or "is defined". `expect(fn).toHaveBeenCalled()`
   and `expect(result).toBeDefined()` kill mutants without proving anything;
   reject both from yourself here. If the mutant is a boundary condition, the
   test asserts behaviour on both sides of the boundary Follow [Test Selection](../../../docs/agents/test-selection.md)
   for the test layer and behavioral coverage.

6. **Verify with ordinary tests.** Run the checks necessary for the test additions.
   Green ordinary tests complete the mutation pass; mutation status belongs to
   a separately chosen mutation task.

## Raising the threshold

Enter this separate maintenance branch only when the user explicitly requests it.
After real kills land, compare the full tier's new score with its configured break
threshold and propose a threshold just below the measured number. Record the baseline
where the config says it belongs.
