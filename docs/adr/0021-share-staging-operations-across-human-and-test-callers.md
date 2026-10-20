---
record: adr
id: "0021"
status: superseded
decided: 2026-09-07
---

# 21. Share staging operations across human and test callers

On 2026-09-07, the maintainer accepted a shared operational surface for people,
agents and E2E preparation, with incremental migration away from direct
infrastructure access. REST, MCP and the staging widget consume the same defined
capabilities and structured inspection contract. Tests still exercise application
transitions through the application when those transitions are what they verify.
The existing direct preparation can be inspected with
`rg -n 'auth\.createUser|updateCustomClaims|db\.collection' tests/_helpers/auth/helpers/authentication.ts`.

The surface exposes commands with explicit intent rather than unrestricted
document, claim or internal-state editing. Artificial states require explicit
commands justified by a test case. This accepts the cost of maintaining a command
catalogue so preparation and cleanup have reviewable effects instead of moving
infrastructure access wholesale into an HTTP endpoint.

Operators have staging-wide operational authority; automation credentials have
explicit capabilities. E2E preparation, inspection and cleanup are limited to the
execution's own data, while global reset requires its own authority. Product roles
do not imply operational authority, preserving [ADR 0016](0016-separate-disposable-staging-data-from-permanent-control.md).

Deployment and startup diagnosis belong to the design, with deployment execution
remaining outside the staging application. Administrative recovery after losing
all Operators or interrupting an operator mutation must use Firebase CLI outside
the application, rather than a new remote recovery service. An unavailable
application cannot host its own only recovery interface. A minimal local helper
may use Firebase CLI administrative authentication when no native command exists,
subject to verifying that integration. This does not authorize silently falling
back to the current ADC helper. Existing recovery instructions remain applicable
until a replacement is implemented and verified. Deployment keeps the authority
separation in [staging preparation](../agents/production-delivery.md).

Impersonation is deferred and excluded from this delivery. The widget uses the
application's current session and is available only to an authenticated Operator;
it disappears on logout. Testing another identity uses an ordinary login in a
separate browser session.

Execution tracking is limited to a persisted execution identifier associating
created data with its cleanup. Commands return the created identifiers. There is
no scenario editor, template library or version management; existing fixtures
continue composing complex preparations.

The first delivery covers environment and reset inspection, creation of disposable
accounts with product roles, email-verification preparation, execution-owned data
cleanup, and migration of the corresponding fixtures. Complex editorial
preparations and visual deployment integration are later increments.

Successful E2E executions clean up their data automatically; failed executions
retain data for diagnosis. Manual preparations remain until explicit cleanup or
global reset. This delivery adds no automatic retention expiry. Global reset is
refused while an E2E execution is active; manual preparations do not block reset.
The widget confirms global reset and execution cleanup with their deletion scope,
including manual preparations for global reset. Account creation, email
verification preparation and inspection execute directly. Authorized automation
uses explicit commands without interactive confirmation.

The official staging E2E runner registers its execution through the operational
API before preparing data, renews a time-limited lease while working, and closes
it when finished. Execution activity is independent of retained diagnostic data.
E2E registration and reset acquisition share an atomic coordination boundary:
an active E2E prevents reset, and a reset in progress prevents E2E startup. A dead
runner eventually stops blocking reset when its lease expires. Lease renewal and
expiry intervals remain implementation choices.

Losing the lease requires the runner to stop its suite and invalidate its result;
an expired execution cannot resume implicitly, and operational commands reject
its authority. Lease expiry is not proof that a process has stopped. The protocol
therefore depends on runner enforcement as well as server checks. Existing runners
can be inspected with `rg -n 'runStagingE2eCli|playwright|finally' bin/stagingE2eCli.ts`.
Tests launched outside the official runner are outside this guarantee; direct
infrastructure access during migration also limits its coverage. Adoption must
make the official runner mandatory rather than claim automatic detection of
arbitrary Playwright processes.

These are accepted design boundaries, not an implementation receipt or approval
to start implementation. Implementation must verify the Firebase CLI helper
integration, lease-loss enforcement and the migration boundary before claiming
the corresponding operational guarantees.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0021-share-staging-operations-across-human-and-test-callers.md) preserves earlier dated wording and superseded clauses.

## Scope and amendments

Follow [0022](0022-production-only-with-disposable-e2e.md) for the replacement
architecture. This historical rationale does not establish external retirement.
