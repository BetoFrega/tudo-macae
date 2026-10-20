---
record: adr
id: "0026"
status: accepted
decided: 2026-09-15
---

# 26. Provisional Tudo Macaé MCP discovery with live execution authority

## Context

Codex desktop may retain the first `tools/list` response for a task. A locked
adapter that advertises only authentication controls therefore cannot make an
editorial operation selectable after a session becomes available, even
though the canonical endpoint has authenticated it.

## Decision

Discovery is not authority. The local adapter always advertises its status tool
and its complete versioned local editorial catalog. Those provisional
definitions are local: name, schema, title, description, annotations and
execution metadata never come from the remote endpoint.

After a complete successful remote listing, a fresh list advertises only the
intersection of that local catalog and the last successful remote names. The
adapter changes that snapshot atomically after all pages succeed. A failed
refresh grants no authority; before a successful snapshot it preserves the
provisional local catalog.

Every tool call still requires the adapter's current authenticated state, a
locally known name and membership in the last successful remote snapshot.
Unknown local names are protocol invalid-parameter errors; known names absent
from an authenticated snapshot are sanitized `forbidden` results. Pending
authentication returns a typed `humanActionRequired`, and remote unavailability returns
`internalFailure`. The canonical endpoint remains final authority and checks the
PAT, Editor role, profile and global mode on every request. Session continuation never
replays a blocked operation.

## Consequences

Retained Codex catalogs can call a newly authorized operation after session issuance
without reconnection or restart. Remote catalog
metadata cannot expand or redefine the local contract, and no additional
credential store or generic dispatch operation is introduced.

## Scope and amendments

Supersedes only the pre-authentication discovery rule in
[ADR 0009](0009-scoped-editorial-tokens-before-oauth.md) and the effective-access
catalog statement in
[ADR 0024](0024-single-owner-editorial-authority-and-mutable-article-editions.md).

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0026-provisional-editorial-mcp-discovery-with-live-execution-authority.md) preserves earlier dated wording and superseded clauses.
