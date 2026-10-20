---
record: adr
id: "0008"
status: accepted
decided: 2026-08-27
---

# 8. Auditable Source Permissions without a Media dependency on Editorial

## Context and requirements

[Source policy](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) separates factual research,
monitoring, text reproduction and Media use. A Source name or successful access
cannot encode permission for every capability; booleans or free-form confidence
would erase evidence and revocation history.

## Decision

Use append-only Source Permission records for broader rights: capability, evidence,
confirming actor, beginning, expiry and revocation. Media stores an opaque permission
reference. Editorial orchestration checks existence, capability and current validity
at finalization/publication; the Media package does not import Editorial internals.

Captures retain precise evidence references and access time. An immutable Submission
selects the exact Captures used so publication can derive its source list from that
selection rather than from every Capture on the Story.

## Alternatives and consequences

Separate records preserve capability-specific evidence and history. A boolean on
Source conflates registration with rights; importing Editorial into Media creates a
cycle. Orchestration accepts the cost of live permission validation and conflicts
when rights are missing or invalid.

## Scope and amendments

The sourcing policy revised the historical 0003 on 2026-08-27. That policy and its
legal/search references live in the contract; this record owns their representation.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0008-press-as-a-controlled-factual-source.md) preserves earlier dated wording and superseded clauses.
