---
trigger: when_operating_or_diagnosing_test_harness
---

# Test Harness Operation

Use this branch to start the local stack, diagnose test-environment failures, or
reason about the test harness. For choosing a tier, see
[Test Selection](test-selection.md); for writing Playwright tests, see
[E2E Test Authoring](e2e-test-authoring.md).

## Vitest tiers

`npm run test:integration` starts the API Worker fixture (`apps/api-worker/testing.mjs`), because the test
environment defaults to the production authorities, Better Auth and D1
Classifieds (`bin/setTestEnvVars.ts`). A fixture that cannot start fails the run
as a `Falha ambiental`. Create accounts and sessions through
`tests/_helpers/auth/helpers/workerSession.ts`.

`npm test` runs both tiers; `npm test -- --tier=unit` or `--tier=integration`
runs one. On pull requests the unit tier runs in the `Checks` workflow
(`.github/workflows/checks.yml`), and the `Vitest Tests` workflow runs only
`--tier=integration` with `--bail=1`, so it stops after the first failed test.
Production delivery runs both tiers and `npm run build:check`. For complete local
diagnosis, keep the unrestricted collection explicit:

```bash
npm test -- --bail=0
```


The complete Vitest collection keeps passing-file output out of the ordinary
console while preserving lifecycle summaries and actionable failure blocks.
Detailed sanitized output remains in `test-results/vitest-logs/` for both tiers
and is retained as a CI artifact even when a test fails. Use `VITEST_VERBOSE=1`
only when the complete sanitized Vitest stream is necessary in the console.

Vitest has startup headroom. `ECONNREFUSED` or a timeout from the API Worker
fixture is an environment failure, not a reason to move an integration test to unit.

## Worktree ports

`bin/appPorts.ts` is the sole authority for the local app port. The primary
checkout uses 5002; each linked worktree derives its own port from its path.
`npm run dev`, the E2E stack, Playwright and the metadata fallback read that
module, so do not hardcode the port elsewhere. Check the invariant with:

```bash
grep -rn "5002" \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.json' --include='*.sh' \
  src bin tests .agents *.ts *.mjs *.json
```

The permitted matches are the port module and comments that name the primary
port. Any other match is a defect.

Ask the worktree for its app URL without starting anything:

```bash
node -e 'import("./bin/appPorts.ts").then(m => console.log(m.appUrl()))'
```

`npm run dev` (`bin/dev.mjs`) refuses to start when that port is already held
and names the holding process.

## E2E stack and preflight

### Invocation planning

Before starting the application stack, select the relevant cases under
[Test Selection](test-selection.md). Group cases that need the same application
revision, configuration and providers into one invocation for the current
validation step. Separate invocations when those requirements differ or a
focused failure diagnosis needs them. Check the selected collection with
Playwright's `--list` before startup when membership is uncertain.

Use the existing collection entrypoints in `package.json` and membership in
`tests/e2e/bin/playwrightCollections.ts`. A case's fixtures repeat preparation within an
invocation; starting another application-backed invocation can also repeat
fixture startup and the production build. Plan both costs. Match any reused
server to the current revision and configuration; require a fresh stack when
that match cannot be established.

Trace each selected fixture's writers and dependent readers to their actual
authority. A qualification environment variable does not reroute a directly imported
Firestore writer; cross-provider fixtures need compatible preparation or a separate
invocation, even when the browser journeys share a build and authentication mode.

To replace an unverified server, stop this worktree's existing stack through its
owning invocation, then require a fresh one with the selected Playwright filters:

```bash
E2E_REQUIRE_FRESH_SERVER=1 npm run test:e2e -- tests/e2e/ads/create-new-ad.spec.ts
```

The command above selects one spec; substitute the affected specs. With this
switch, an occupied app port is an environmental blocker rather than a server
to reuse. The full collection's provider wrapper already requires a fresh stack.

Blog and Media run on the API Worker fixture's D1 and R2, whose editorial
authority the stack promotes to `worker` at start.

Record the selected scope, commands and results as required by Test Selection.
Planning is complete when every required case belongs to a compatible
invocation and each extra startup has a concrete configuration, changed-code
or diagnostic reason.

### Validation layers

Use the cheapest layer that can reject the change, without treating the layers as
substitutes:

- `npm run typecheck` generates the current Next.js route types and runs TypeScript
  across the application, tests and harness. It starts no fixture, server or browser.
- `npm run build:check` starts the API Worker fixture and runs the complete Next.js
  production build. It also validates compilation, prerendering and Next.js's final
  typecheck.
- `npm run test:e2e` owns the disposable API Worker fixture, production build,
  server and browser stack, then verifies the integrated user journeys.

The local pre-push hook runs only the fast typecheck. Pull requests run that same
command in the `Checks` workflow, reported as the `Typecheck` check run next to
`Lint`, `Web Workers` and the unit-tier shards; bypassing the hook
therefore does not bypass the checks the branch protection requires.

Playwright prepares Git LFS test assets, starts the API Worker fixture, then
uses `next build && next start`.
`npm run test:e2e` owns that stack; `npm run dev` is the hot-reload app. See
[E2E Test Authoring](e2e-test-authoring.md) for the test-side commands.

`npm run dev` and `dev:full` (`bin/dev.mjs`) start the API Worker fixture with
D1 Classifieds, then `next dev` with the fixture's environment, so local login
and Classifieds use Better Auth and D1. The fixture lives in memory: every boot
starts empty and the demo seed refills it. A fixture that cannot start stops the
stack before `next dev` starts. `bin/devEnvironment.ts` owns the other
variables `next dev` receives.

The application-backed collections stop after their first failed test, because
every case shares that stack and later failures may repeat one environmental
loss. Use `npm run test:e2e:diagnostic` or
`npm run test:e2e:full:diagnostic` only when diagnosis needs every independent
failure. The standalone harness remains unrestricted because it does not share
the application stack.

On macOS and Linux, an invocation waits for every process group it started to
exit before returning; this includes interrupted and failed runs. A server
accepted through Playwright's `reuseExistingServer` belongs to its original
caller and is never stopped by the reusing invocation. The wrapper turns the
first external interruption into one graceful Playwright interrupt; Playwright
then waits without a force-kill timeout while the stack owners release their
groups and ports. A child that ignores termination can therefore block the run
instead of being abandoned. On Windows, descendant cleanup remains best effort.

`tests/e2e/_helpers/global-setup.ts` runs after the app responds and before tests.
It prepares Git LFS assets for reused servers and checks
that every static asset referenced by the running app still exists. Treat its
message as the diagnosis rather than an application failure.

### Resource contention

When startup or tests time out with providers reachable, inspect host load,
memory pressure and concurrent validation before retrying. If contention is
plausible, sequence this task's costly builds and suites and release only its
owned processes. Retry the canonical invocation after conditions change;
preserve the failed result rather than extending timeouts to obtain a pass.
Before retrying, copy the failed run's sanitized logs, reports and test output
to a distinct location outside runner-managed output directories, recording
the revision, command and conditions; canonical output paths can be overwritten.

Keep earlier passes, current-revision failures and later successful runs
distinct. For CI evidence, verify the job actually collected the affected tests
on the reviewed revision. A pass after load subsides supports contention as an
explanation; it does not establish the unique cause. Required browser evidence
still follows [Test Selection](test-selection.md#required-e2e-execution).

### Git LFS test assets

`bin/testLfsAssets.ts` discovers tracked `tests/**` files whose Git filter is
`lfs`. Before the fixture or build, `tests/e2e/bin/e2e-stack.mjs` restores missing files and
pointers with `git lfs checkout tests/**`. If any remain, it fetches `origin HEAD`
with `--include=tests/** --exclude=`, checks out again, and verifies the files.
This applies to normal, full, diagnostic and direct Playwright runs. Global setup
uses the same preparation before tests when the app server is reused.

A hydrated checkout uses local Git metadata only; it needs neither a remote
connection nor Git LFS installed. Checkout preserves locally modified files.
Unresolved pointers stop the run with an `E2E environment` diagnosis. Install
Git LFS when absent, check remote authentication/connectivity and repository/cache
write permissions, or resolve the reported local pointer edit, then retry the
same test command. Do not change global filters or treat this as an app failure.
Git command failures report their stage, exit code and a bounded `reason`
category; raw command diagnostics and remote URLs are never printed.

### Stale `.next/` assets

`npm run build:check` can replace assets held by a running E2E server. Stop the
old server, then run `npm run test:e2e` to rebuild and restart the stack.

### Pre-provisioned Chromium

If the installed browser revision differs from Playwright's pinned revision,
point it at the supplied browser for that invocation:

```bash
E2E_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
```

Leave this escape hatch unset locally and in CI when Playwright supplies its
matching browser.

## Harness self-tests

When changing Playwright configuration, fixtures, page objects or diagnostics, run
the harness collections. Use `npm run test:harness` when only those collections
are needed. When verification also needs application journeys, compose the
selected journeys and all required harness cases through `npm run test:e2e:full`
in one invocation. Confirm that any file or grep filters retain the required
harness cases; use the unfiltered full collection when that scope is needed.
The full collection follows the application-backed failure budget and diagnostic
escape hatch defined above.

Synthetic browser checks belong to the standalone collection; fixtures mutating
application state retain the application stack. The ordinary E2E command collects
application journeys only. The deployment workflow uses the full collection.

For a focused diagnosis use `playwright.harness.config.ts` or
`playwright.harness-app.config.ts`. For JSON timing evidence use a distinct
`PLAYWRIGHT_JSON_OUTPUT_NAME` for each invocation so reports do not overwrite.

## E2E log budget

The ordinary console shows lifecycle milestones, Playwright progress and actionable
warnings or errors. Detailed sanitized output remains available after the run in:

- `tests/e2e/test-results/e2e-logs/build.log`; and
- `.next/e2e-server.log`.

Native email-verification links and their `oobCode` or `apiKey` parameters are redacted
before either console or file output. Use `E2E_VERBOSE=1 npm run test:e2e -- ...` only
when the detailed sanitized stream is necessary for an active diagnosis. A normal run
must stay compact enough for an agent to inspect without loading build route tables,
routine operational INFO events or repeated runtime warnings into its context.

The selection policy applies to all test collections; diagnostic aggregation is
currently enabled by the E2E stack and its Playwright wrapper only. A specifically
recognized expected warning stays in the detailed artifact. Unknown warnings remain
visible; an HTTP status alone never establishes that a response was expected.

E2E diagnostics print their first occurrence immediately, retain stack context, and
group repetitions by cause and relevant context. Structured timestamps and request,
correlation, trace and span identifiers and Node warning PIDs do not split a group. Different operations,
listener events and stack origins do. New diagnostic details print immediately.
Counts include the first occurrence, update at most once every 30 seconds when they
grow, and appear in the final summary with the artifact location. A failing test keeps
its assertion and stack visible without releasing the preceding detailed log.

The wrapper spools sanitized runner output incrementally to a unique
`tudomacae-e2e-logs-*/playwright.log` directory under the operating system's
temporary directory. After the runner and its descendants exit, it publishes
`test-results/e2e-logs/playwright.log`, so Playwright output-directory cleanup,
including CLI overrides, cannot delete the open log. Cooperative interruption or a
closed console pipe triggers process-group cleanup and marks the summary incomplete;
a reported timeout does so when the runner exits unsuccessfully. Forced termination
may prevent the summary but does not discard output already written to the temporary
directory. Exit codes and process-group cleanup remain owned by the supervisor.

Each stream tracks at most 256 diagnostic groups and 256 details per group. Beyond
these limits, novel diagnostics remain visible rather than being silently discarded;
the summary reports ungrouped occurrences. Summary labels use at most 300 characters;
the first emission and detailed artifact preserve the complete message. `E2E_VERBOSE=1`
restores all sanitized occurrences for the duration of that invocation.

Explicit JSON, JUnit, blob and custom reporters, and custom configurations without
an explicit human reporter override, keep the complete sanitized console
stream without human summaries so stdout remains parseable. Their incremental
runner artifact remains available at the same path.
