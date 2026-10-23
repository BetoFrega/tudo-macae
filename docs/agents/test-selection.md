---
trigger: when_creating_changing_reducing_or_selecting_tests
---

# Test Selection

Choose a test tier by the dependency that proves the behaviour, not by the
test's location.

- **Unit (Vitest):** pure business logic, validation and utilities. It is
  hermetic; run it without the API Worker fixture:

  ```bash
  npm run test:unit
  ```

- **Integration (Vitest):** one module whose rule depends on API Worker fixture
  behaviour, without a browser. Name it `*.integration.test.ts` and run it in the
  default Node environment as [Test Harness Operation](test-harness-operation.md)
  describes.

- **Worker runtime (Vitest):** Worker behaviour that depends on its real
  bindings (D1, R2, Images) under the local Workers runtime. Name it
  `*.runtime.test.ts` under `apps/` or `bin/`, the only paths
  `vitest.worker.config.mts` collects, and run it with
  `npm run test:worker -- <paths>`; it binds local ports.

- **E2E (Playwright):** essential user journeys and behaviour whose proof needs
  a real browser or the integrated application. Keep representative checks of
  the connection between layers; cover rule variants in unit or integration
  tests. Follow [E2E Test Authoring](e2e-test-authoring.md).

## E2E composition

Before adding or changing an E2E case, compare its guarantees and preparation
with existing coverage of the affected journey. Apply this decision during
ordinary feature work as well as suite reduction; keep the comparison scoped
to the affected behaviour.

1. **Guarantees:** inventory the observable results and locate their existing
   unit, integration and E2E checks. Done when every affected guarantee has a
   check in the least costly tier that proves it, or a named coverage gap.
2. **Composition:** compare extending a compatible journey, preparing only the
   fixture state it needs, sharing an immutable fixture across read-only cases,
   and keeping an independent case. Preserve each case's ability to run alone,
   in any order, with isolated mutable state and cleanup. Use named steps so
   failures identify the guarantee. Done when the choice identifies preparation
   eliminated, or the distinct integrated failure or incompatible preconditions
   that require a separate case. Fewer cases alone do not justify composition.
3. **Coverage:** close the gaps and verify the resulting cases under
   [Required E2E execution](#required-e2e-execution). In the PR and delivery
   report, account for every added or changed case by its guarantees, comparison
   with existing coverage and setup decision. Done when every affected guarantee
   maps to passing coverage and each independent case has a concrete reason
   that extending an existing journey would not preserve it.

## Required E2E execution

Before completing a behaviour change, run at least the E2E tests relevant to
the affected journeys, including journeys affected indirectly by shared code
or runtime configuration. Select tests by the behaviour affected, not only by
which test files changed. Follow [Test Harness Operation](test-harness-operation.md)
for execution.

Record the selected scope, commands and results in the PR and delivery report.
Passing PR checks does not replace this execution. If no E2E test applies,
explain why; if execution is blocked or tests fail, report validation as pending
with the concrete blocker or failure. Rerun affected tests after subsequent
changes that could invalidate their results.

The same rule applies to Worker runtime suites: before completing a change to
Worker behaviour or to a package it composes, run the affected
`*.runtime.test.ts` suites and record them the same way. Pull request checks
run them only when the branch has a pull request and its paths match the
workflow filters.

## New and changed behaviour

For new code, put each verification in the least costly tier that proves the
real behaviour through an existing public interface. Pure validation,
authorization rules, conflicts and idempotency belong in unit or integration
tests according to their dependencies. Preserve E2E proof of their connection
to sessions, navigation, forms, uploads and visible mutation effects when that
proof needs the integrated application. Component behaviour that jsdom can
prove belongs in Vitest; browser-dependent behaviour stays in Playwright.

For authorization changes, cover the affected actor, channel and operation
combinations, including reads, mutations and receipt replay where applicable.
Use otherwise valid commands and an authorized success control: invalid input
can conceal a missing permission check. Assert denial leaves domain state and
receipts unchanged. When the contract requires current roles, revoke a role
while retaining the credential and exercise the real transport's authority
resolution; a preconstructed actor alone cannot prove it.

For resource-bound confirmations, use distinct resource IDs with equal visible
fields and revision values. Cross-resource evidence and a stale snapshot must
be rejected without consuming the operation key or changing either resource;
a fresh confirmation must still succeed through the same public interface.
For aggregate confirmations, stale each confirmation-bound component independently,
including membership and related state; assert rejection without mutation or
receipt consumption for every component.

When a subprocess test depends on operating-system signal or wait semantics,
run the real entry process and relevant child commands. Stub provider responses
outside the process boundary under test: replacing a child with a shell function
can change signal handling and conceal a failed trap. Signal the process the
caller targets and enforce a bounded shutdown interval. Assert the contracted
exit status, owned-resource cleanup and downstream effects; clean up fixture
processes on both success and failure.

Whenever a change touches application behaviour or its tests, review the E2E
verifications of that affected behaviour and migrate misplaced rule coverage
as part of the change. The migration unit is a behavioural verification, not
every test in an opened file or the whole feature:

1. Identify the observable result being verified and its appropriate tier.
2. Find or add equivalent coverage through the public interface in at least
   one unit or integration test. Exercise the real rule; mocking that rule or
   pointing to a similarly named test does not establish equivalence.
3. Run the replacement coverage successfully before removing the E2E
   verification. Then reassess the remaining case against the other E2E
   journeys: identify the concrete integrated failure it uniquely detects.
   When existing journeys already prove that connection, remove the redundant
   case after verifying those journeys. Preserve each affected browser-specific
   guarantee, rather than one representative case per migrated test.
4. Remove preparation, requests and waits made unnecessary by the migrated
   checks. Retain an E2E case only with a specific integrated guarantee and an
   explanation of why the remaining suite and lower tiers do not prove it.
   Running through HTTP or a browser alone does not establish that need.
5. In the PR, map removed verifications to replacement tests and report their
   execution. For removed cases, also identify the surviving E2E coverage of
   any integrated guarantees. If none need migration, say so briefly.

If migration requires substantial application refactoring beyond the change,
keep the E2E coverage and explain the specific impediment in the PR. Leave
unrelated coverage to its own work. A change is incomplete while misplaced
coverage of affected behaviour is neither migrated nor explicitly justified.

## Migration compatibility

When replacing persistence, validation or file-path encoding, derive fixtures
from the supported source contracts as well as the new writer. Include historical
identifier shapes and limits, ordering, and owned, shared or unmanaged references
that the affected capability accepts. New-writer fixtures alone do not prove
compatibility with persisted records.

Exercise those values through every affected public consumer: transfer, lookup,
replacement, publication and deletion where applicable. Verify that transformed
keys retain their identity and ownership across the lifecycle. Cover mapping and
policy in unit tests; use the real adapter runtime for persistence, object
availability and concurrent revision checks. Keep browser coverage proportional
under [E2E composition](#e2e-composition).

## Read-only tooling

For commands advertised as dry-run or comparison, verify the full invocation,
including runtime startup, migrations and shutdown. Compare the original source
and destination before and after both success and failure, including schema,
migration ledger, records and objects. A handler that issues no writes does not
prove the command leaves those resources unchanged; disposable simulation copies
are outside that original-resource comparison.

## E2E reduction work

For work intended to reduce the E2E suite or its runtime, evaluate whole cases
and their setup before trimming assertions. Inventory the affected case's
guarantees, locate equivalent coverage across the remaining suite, and remove
redundant cases when all guarantees are preserved.

Use [E2E composition](#e2e-composition) to evaluate repeated preparation and
justify each retained case against the surviving coverage.

Report separately what was removed (cases, fixtures, requests, waits or
infrastructure startup), what coverage moved, and what runtime was measured.
Fewer assertions alone do not establish reduced execution work.

Claim a runtime improvement only with comparable measurements that include the
affected lower tiers and setup cost. State sampling and environment limitations.
When no execution work was removed or no time saving was demonstrated, report
that explicitly and describe the result as coverage redistribution or a
documented impediment, rather than completion of the reduction objective.

## Vitest environments

Every ordinary entrypoint defaults to Node. A test that renders a component or
hook with Testing Library explicitly declares `// @vitest-environment jsdom`
at the top of its file. A `.tsx` extension alone does not require a DOM.

The named non-TSX exception is
`packages/media/tests/imageProcessing.test.ts`: its browser image pipeline uses
canvas and FileReader. Keep server integration in Node; needing the API Worker
fixture does not require a DOM. Do not fabricate browser globals to move DOM behavior
into Node. DOM matchers load only in the explicitly selected DOM environment.

`bin/ordinaryTestCollection.test.ts` checks the defaults, DOM opt-in and the
named exception. Existing render and interaction assertions must survive an
environment change, as must the collected files, cases and skips.

## Package test surface

Package entry points are the test seam. Tests in a package's `tests/` directory
call root entry points and never import `lib/` or `lib/db/`. Choose the tier per
behaviour, including within a single package. Follow
[Domain Infrastructure Seams](domain-infrastructure-seams.md) for controlled
construction, internal adapters and the separation of rules from infrastructure
guarantees.

When deepening a legacy capability, apply the migration procedure above
through the new package interface.

## Integration boundary

Use integration tests only when the API Worker's behaviour is the rule under
test, such as the demo seed writing its mass through the fixture.

Feature tests sit beside the feature; package tests stay in the package's
`tests/` directory. `npm test` explicitly composes `test:unit` and `test:integration`. File location does not
determine environmental dependencies.

An integration fixture may directly write only a legacy or malformed persisted
precondition that no public entry point can create. The public operation and all
assertions still use entry points. Do not use this exception to inspect storage,
manufacture ordinary states, or test ordinary writes.

## Mutation testing

Mutation is optional and never a completion gate. When choosing it, follow [Kill Mutants](../../.agents/skills/kill-mutants/SKILL.md).
That skill is the sole authority for mutation scope, execution and survivor
triage.

## Feature coverage checklist

When [Feature Development Workflow](feature-workflow.md) reaches its test step,
complete this checklist through the appropriate public seam:

- cover pure rules with unit tests;
- cover API Worker-dependent rules with integration tests;
- cover behaviour that depends on real Worker bindings with Worker runtime
  tests; and
- preserve each affected browser journey with E2E coverage.

For existing behaviour, also complete the incremental migration procedure in
"New and changed behaviour" above.

The tier sections above decide the seam and its constraints; this checklist is
the feature-completion gate.
