---
record: adr
id: "0025"
status: accepted
decided: 2026-09-15
---

# 25. Neutral shared machine transport for separate domain capabilities

## Context and requirements

One operator has Editor and Administrator roles, but administration must not become
editorial authority for every Editor. [Category administration](https://app.notion.com/p/3ff84301eab38105b082fe689a5682cd)
owns product invariants and current access limits.

## Decision

Reuse one MCP/HTTP catalog and executor for domain capabilities. MCP stays /mcp;
HTTP uses /tools/v1; npm run tudo-macae and local stdio/Codex identities are neutral.
Cut over application, client and edge coherently without permanent aliases; /editorial/v1
then returns 404. Existing editorial credentials, profiles, collections/configuration
retain names because their underlying responsibility is unchanged.

The categories package owns shared creation used by human and machine callers.
Transactions enforce slug uniqueness and parent existence/non-deletion; an operation
receipt, normalized input and result commit atomically. Replay returns the result even
after later deletion and repeats cache invalidation that a lost response may have skipped.
Local clients preserve key/recovery identity after uncertainty. Replay is not another create.

Live authenticated roles/profile/mode enforce capability boundaries. The current shared
credential does not grant administration merely through fullEditorial. Discovery is not
authority; provisional local advertisement follows
[0026](0026-provisional-editorial-mcp-discovery-with-live-execution-authority.md).

## Alternatives and consequences

A second administrative transport/store/install duplicates delivery and recovery.
Renaming all persisted editorial records would couple unrelated migration risk.
Before enforcing unique slugs, inspect existing data. Separate administrative credentials,
generic permission infrastructure and extra machine mutations await a real caller/need.
Schemas/tool inventory stay in code, behavior in the category contract and external
activation in [the edge guide](../agents/editorial-cli.md).

## Scope and amendments

Supersedes 0023's editorial-only presentation and 0014's MCP-only resource boundary.
This record does not itself deploy endpoints or edit local client configuration.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0025-neutral-machine-tools-with-administrative-categories.md) preserves earlier dated wording and superseded clauses.
