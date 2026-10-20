---
record: adr
id: "NNNN"
status: proposed
decided: YYYY-MM-DD
---

# N. Structural choice

## Context and requirements

Link the capability contract and owning context. Explain the constraints that
make this architectural choice necessary; do not restate the product contract.

## Decision

Record one coherent choice about structure, boundaries, representation,
dependencies, consistency, protocols, security or topology. Architecture includes
application, infrastructure and technical harness mechanisms.

## Alternatives and consequences

Explain the plausible alternatives, why this choice was selected, its cost and
the condition that would justify reconsidering it. Acceptance is not proof of
implementation or production activation.

## Scope and amendments

Record dated amendments and explicit supersession with links. `status` in the
metadata is the single source of lifecycle state: `proposed`, `accepted`,
`partially-superseded`, `superseded` or `historical`. `decided` is the original
decision date; `unknown` is reserved for imported records whose date was absent.

## Review checklist

- Is this a structural choice with alternatives and trade-offs?
- Do requirements and policies remain in their canonical contracts?
- Is the decision cohesive enough to reconsider independently?
- Are date, ID, scope and supersession unambiguous?
- Does the text distinguish acceptance, implementation and activation?

For relocation, keep the old filename as a short pointer with `record: pointer`,
the original `id`, `status: transferred`, the original `decided` value, and local
Markdown links to all destinations. An alias is not another canonical ADR with
that ID. The original text remains in Git history.
