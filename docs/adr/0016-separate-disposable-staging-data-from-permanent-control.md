---
record: adr
id: "0016"
status: superseded
decided: 2026-09-02
---

# 16. Separate disposable staging data from permanent control

## Context

Staging application data must return to a deterministic baseline, but deleting the identities and credentials that authorize that operation would make every reset depend on broad administrative credentials. Treating product roles as operational authority would also let an Administrator or Editor acquire destructive staging access accidentally.

## Decision

Staging has two lifecycle planes. Application data is disposable; the operational control plane rooted at `staging_control/primary` and Auth identities carrying `stagingPersistent: true` are permanent until explicitly administered. The independent `stagingOperator: true` claim grants live operational administration but never implies `stagingPersistent`, `admin` or `editor`, and none of those claims imply operational authority.

The first valid Operator, and recovery after every valid Operator has been lost, use one explicit local CLI bootstrap backed by existing Google/Firebase administrative authentication. Bootstrap is not an HTTP operation and is guarded by the exact `tudomacae-staging` project. Routine administration uses Firebase identity through a staging-only REST interface that disappears as `404` unless both the exact project and the explicit staging capability are configured; the commands and configuration contract live in [Staging control operations](../agents/production-delivery.md).

Named operational clients and their independently revocable `staging:reset` tokens live under the control root. A token is an opaque public id plus a random 256-bit secret, is returned in clear text only when issued, persists only as a SHA-256 digest, never expires automatically and records its issuer, creation and eventual revoker. Reset, operational MCP, promotion and any product interface remain separate decisions.

## Consequences

- A reset can later delete the disposable plane without destroying its own authority, credentials or the issuer/creation/revocation metadata kept on operational records.
- Losing every Operator requires deliberate local administrative recovery; no public recovery path can widen authority.
- Operator mutations fail closed behind one non-expiring lock. A process failure can require deliberate local removal of that lock after confirming no mutation is running; automatic lease takeover cannot violate the last-Operator invariant.
- Production omits the staging capability configuration, so the operational REST surface fails before authentication or control-plane access.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0016-separate-disposable-staging-data-from-permanent-control.md) preserves earlier dated wording and superseded clauses.

## Scope and amendments

Follow [0022](0022-production-only-with-disposable-e2e.md) for the replacement
architecture. This historical rationale does not establish external retirement.
