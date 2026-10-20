# Domain docs

This is a multi-context repository. [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) owns
discovery, relationships, the bilingual naming convention and fallback. Context
glossaries live under `docs/contexts/`; architectural decisions live in `docs/adr/`.
[Product conventions](product.md) locate capability contracts and define migration
between Notion records and the contracts indexed by
[document routing](https://app.notion.com/p/3f684301eab381fdb618ca7626c9f609).

## Before exploring

1. Read the map when a task names a domain concept, changes terminology or touches an
   associated path.
2. Load only the affected context glossaries. A cross-reference does not automatically
   load its target glossary.
3. When ownership remains ambiguous, widen to candidate contexts. If no candidate can
   be excluded safely, read every glossary before naming or changing the concept.
4. Read the affected capability contract when behavior or policy is involved, then
   the ADRs that constrain its implementation. Do not load unrelated contracts.

## Use the owning glossary

Use the canonical Portuguese or English name recorded by the context that owns the
semantics. Do not drift to synonyms listed under `_Evitar_`. A similarly spelled term
in another context may have a different local meaning; make that distinction explicit
instead of forcing one global definition.

If a required concept is missing, establish its meaning and owning context from the
current behavior and requirements. Resolve ambiguous semantics with the user, then
record the agreed concept using the glossary-entry rules below.

## Add or change a glossary entry

Match neighboring entries. Each entry has:

- a `Português / English` heading with both canonical conceptual names;
- a tight definition of what the concept is and the distinctions that govern it;
- an `_Evitar_` line when synonyms would blur the boundary.

Persisted fields, collections and implementation types stay in their technical source.
Keep state values or invariants in the definition when removing them would change the
meaning. Update the map when ownership, relationships or load signals change.

## Record the right kind of decision

An ADR records a significant structural choice in application architecture,
infrastructure or a technical harness mechanism: boundaries, representation,
dependencies, consistency, protocols, security or topology, with alternatives and
trade-offs. A product requirement or an operating convention does not become an ADR
merely because implementing it has technical consequences.

Use the [ADR template](../adr/TEMPLATE.md) and [index](../adr/README.md). Put reusable
behavior, permissions and product policy in the capability contract; concepts in the
owning glossary; operating steps in the applicable guide; stories, implementation
state and investigation evidence in the tracker. Link these sources rather than copy
their rules. A mixed decision separates requirements from the architectural response.

Before accepting an ADR, verify that it names a structural choice, explains its
alternatives and consequences, links its requirements, and distinguishes acceptance
from implementation. Preserve decision dates and explicit supersession. Relocation
does not change a decision: an old path becomes a short `pointer`, not a second
normative copy. Do not reuse an old ID for a different decision.

## Flag contract and ADR conflicts

If your output contradicts an existing contract or ADR, surface it explicitly rather
than silently overriding it. An explicit supersession determines the current rule;
newer prose or current code alone does not settle an unresolved product conflict.

> _Contradicts ADR-0001 (use npm instead of pnpm) — but worth reopening because…_
