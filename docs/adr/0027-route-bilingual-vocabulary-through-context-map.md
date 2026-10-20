---
record: adr
id: "0027"
status: accepted
decided: 2026-09-16
---

# 27. Context-owned vocabulary with selective information discovery

## Context and requirements

A root glossary mixed product, administration, agent/test harness and retired staging;
every task loaded all terminology. Physical package layout cannot define context
ownership because contexts cross packages. Discovery belongs to
[Context Map](../../CONTEXT-MAP.md), procedure to [Domain Docs](../agents/domain.md).

## Decision

Use one discovery map for responsibilities, typed relationships, load signals and
fallback, plus one glossary per owning context under docs/contexts. Paths are routing
evidence, not context boundaries. Do not cache collection/field/enum representation
in a glossary; code owns those details. Definitions retain distinctions needed for
meaning. The map owns the bilingual convention, not duplicated local instructions.

Discovery loads only affected owners, widening to candidate contexts when ownership
is ambiguous and all glossaries only when no candidate can be safely excluded.
Product behavior follows capability contracts; structural decisions and procedures
have their separate routes under the 2026-10-04 organization.

## Alternatives and consequences

A global glossary wastes context; a package hierarchy misstates ownership. Distributed
owners reduce unrelated loading while explicit fallback prevents missing a concept.
Adding/moving terms updates map/pointers and consistency checks, not code directories.
Typed relationships distinguish consumption, authority, verification, discovery and
planned integration without pretending a planned relationship is implemented.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0027-route-bilingual-vocabulary-through-context-map.md) preserves earlier dated wording and superseded clauses.
