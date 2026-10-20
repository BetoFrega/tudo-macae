---
record: adr
id: "0022"
status: accepted
decided: 2026-09-10
---

# 22. One persistent production environment with delivery on every main push

## Context and requirements

Permanent staging lifecycle/access/operations added cost. Recurring browser-suite
runner costs and browser failures in delivery led to the 2026-10-04 amendment.
[Production delivery](../agents/production-delivery.md) owns dispatch,
incidents, recovery and external resource retirement.

## Decision

Production is the only persistent application environment. Each delivery fixes
the candidate SHA and deploys that exact tested SHA only after delivery checks pass.
Every push to main delivers its SHA; a trusted operator can dispatch a retry of
the current main. Ordinary PR checks remain independent.
The complete E2E collection runs on a disposable local stack in the delivery checks
and gates production mutation.

## Alternatives and consequences

One persistent environment avoids maintaining permanent staging identities/data.
Standard runners are free on the public repository, so the E2E gate costs delivery
time, not runner minutes; a browser-suite failure blocks delivery until fixed.
Emulator checks do not prove real IAM, indexes or provider behavior.
Local tests remain development/diagnostic tools without mandatory qualification receipts.
Production verification and compensation follow the operating guide, not a second pipeline
in this ADR. Removing staging-exclusive code, credentials/resources requires proof of
replacement and preservation of shared resources/data; acceptance is not a retirement receipt.

## Scope and amendments

Amended 2026-09-26, 2026-10-04 and 2026-10-20. The 2026-10-04 amendment supersedes
the automatic E2E deployment gate; the 2026-10-20 amendment replaces manual-only
dispatch with delivery on every main push and restores the E2E delivery gate. The original decision date remains
2026-09-10.
Supersedes the staging architecture in
[0016](0016-separate-disposable-staging-data-from-permanent-control.md),
[0020](0020-restrict-staging-application-access.md) and
[0021](0021-share-staging-operations-across-human-and-test-callers.md).

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0022-production-only-with-disposable-e2e.md) preserves earlier dated wording and superseded clauses.

The [2026-10-04 amendment](https://github.com/BetoFrega/macae-classificados/pull/1622)
records why E2E became local/manual only.
