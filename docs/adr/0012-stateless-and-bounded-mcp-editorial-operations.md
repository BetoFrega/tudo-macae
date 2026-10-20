---
record: adr
id: "0012"
status: partially-superseded
decided: 2026-08-27
---

# 12. Stateless bounded operations with durable replay and concurrency

## Context and requirements

A connection and one database transaction are not a reliable unit for a long client
run. [Editorial workflow](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) owns operation intent;
[source policy](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) owns evidence limits.

## Decision

Each operation is independent; durable credentials, revisions, receipts and activity
hold truth, never MCP connection/session memory. Valid reusable records survive a
later operation's failure. Operation creates use idempotent receipts; strict expected
revisions protect writes. The adapter generates/preserves one key per request and may
accept a caller key for interruption recovery. Technical replay is not approval.

Reads use explicit filters, stable cursor ordering, default 20/max 50; no export-all
or unbounded mutation batch. Initial configurable per-client limits are 120 reads
and 30 mutations per minute, with a retry time on rate responses. Quotas/page sizes
can be tuned from measurements without changing operation meaning.

The shared request envelope verifies authenticated caller and origin, correlates
requests, records activity, enforces rate limits and returns stable sanitized failures:
unauthenticated, forbidden, expired credential, validation, missing entity, revision,
duplicate, human action, rate limit and internal failure. Internal failures exclude
stack traces, credentials and private payloads; revision failures return the minimal
current state needed to reevaluate intent. Canonical inputs cannot choose the Editor,
installation or evidence origin. External evidence is separate from control fields.

## Alternatives and consequences

Explicit replay and revision state let disconnected clients resume without automatic
merge. An all-or-nothing newsroom run would discard useful reusable work; connection
state creates hidden correlation/authority inheritance. Bound reads limit accidental
bulk extraction while preserving iterative lookup.

## Scope and amendments

The mandatory begin/close/24-hour Delegation lifecycle and explicit local binding,
including the 2026-08-30 parallel-agent binding amendment, were superseded on 2026-09-11.
Optional grouping has no authority. The old excluded editorial powers are replaced
by the workflow contract. Ordinary correlated operational logs remain; dedicated
persistent security/metric collections require demonstrated operational use.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0012-stateless-and-bounded-mcp-editorial-operations.md) preserves earlier dated wording and superseded clauses.
