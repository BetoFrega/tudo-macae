---
record: adr
id: "0023"
status: partially-superseded
decided: unknown
---

# 23. Permanent MCP and HTTP CLI over one canonical catalog and executor

## Context and requirements

Reload failures motivated an independent CLI without retiring MCP. Separate tool
inventories/handlers would drift. [Editorial workflow](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a)
owns intent/authority; [CLI guide](../agents/editorial-cli.md) owns operation/recovery.

## Decision

One catalog owns name, description, input schema, access and metadata. Names/hints/help
and invocation schemas derive from it. The typed executor map uses inferred catalog
names/inputs; missing, unknown or incompatible handlers fail typechecking. Catalog
loading has no credentials, Firebase initialization or executable handler dependencies.
Compatibility exports contain no separate inventory or policy.

A tool change edits one definition and one handler where behavior changes. Server
execution returns domain JSON; MCP framing and HTTP versioning belong to adapters.
Manual and machine callers use the same editorial module. Never mirror one write
through both transports; reconcile durable state after uncertainty and deliberately
retry with the preserved key. Authentication recovery never replays a write.

The local session provider is shared by CLI/MCP under [0029](0029-short-editorial-client-sessions-derived-from-pats.md).
Its elected lease-bound continuation resolves only the configured PAT via 1Password
SDK desktop authentication in a disposable Node subprocess; no op command, daemon,
service account or alternative secret lookup. Domain and credentials do not move to CLI.

## Alternatives and consequences

A transport-to-transport parity table needs synchronization; deriving consumers from
one typed catalog avoids it. Protocol adapters still need their own tests. Help can
load offline, while setup/continuation may require native human presence. External
activation and edge verification are separate from repository implementation.

## Scope and amendments

Updated 2026-09-15; the original acceptance date was not recorded. Authority and
public operations changed on 2026-09-11. Neutral presentation/resource follows
[0025](0025-neutral-machine-tools-with-administrative-categories.md), not /editorial/v1.
Per-command PAT reads and process-only credentials were replaced by 0029.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0023-editorial-cli-over-http.md) preserves earlier dated wording and superseded clauses.
