---
record: adr
id: "0010"
status: partially-superseded
decided: 2026-08-27
---

# 10. One deep editorial module behind every caller

## Context and requirements

Legacy Server Actions and news use cases spread validation, authorization and
persistence. Adding transport-owned rules would create divergent manual and machine
paths. [Editorial workflow](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) owns their common
behavior; [0036](0036-single-article-identity-with-edition-history.md) owns the
unified Article representation. Source registration and revisioned edits follow
[Editorial sourcing](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a).

## Decision

A deep editorial package exposes domain entry points to Server Actions, MCP, HTTP
and future callers. Verified EditorialCaller identity enters the module; mutable
input cannot select the Editor, client or authority. A manual caller uses newsroom
identity without inventing a technical client; a machine caller carries its verified
installation. Models, tasks and subagents are diagnostics, not authorization principals.
Validation, rules, orchestration and Firestore persistence remain private.

Media is a separate autonomous package under [0004](0004-media-as-an-autonomous-library-with-closed-kinds.md).
Within Editorial, mutations and content-free EditorialActivity commit in the same
transaction rather than logging best-effort. Cross-package work records a pending
intent, invokes Media idempotently with operation ID and records completion/failure;
interrupted intents are reconcilable. Media never imports Editorial or writes its
activity directly. Preserve the acyclic dependency graph.

## Alternatives and consequences

One shared module prevents transport-specific authorization/review semantics. Shallow
packages per entity or rules in adapters preserve the divergence. Move the complete
affected capability from legacy news code and remove its old writer. Collections,
paths, cookies and MCP protocol objects do not cross the package interface.
Operational accountability is distinct from durable domain evidence and history.

## Scope and amendments

On 2026-09-11 separate first-class Draft/Submission identities, manual-only operations
and mandatory dedicated request collections were superseded. Request correlation and
ordinary content-free operational logs remain; dedicated persistent per-request metrics
or security collections require demonstrated use. Domain history remains with its
records, independent of operational retention. The current operational activity
retention rule belongs to the editorial contract.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0010-one-editorial-module-behind-every-caller.md) preserves earlier dated wording and superseded clauses.
