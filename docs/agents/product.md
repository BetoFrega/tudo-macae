# Product documentation conventions

Applies to `github.com/BetoFrega/tudo-macae` across its checkouts.
This file configures discovery and representation; product records retain their
own decisions, evidence and history. The original destination was accepted by Beto
Frega on 2026-10-05 in the [Tudo Macaé Space archive](https://chatgpt.com/space/page_6ac030ef2ab481919b6ff0b9ef71b213).
On 2026-10-11, Beto authorized migration of all product documentation and approved
Notion as the canonical destination. The new root is
[Tudo Macaé in Notion](https://app.notion.com/p/3f684301eab381fdb618ca7626c9f609?pvs=204),
ID `3f684301-eab3-81fd-b618-ca7626c9f609`. Readback verified the transfer of all 25
Pages, their hierarchy and links, and all 3 attached files. Notion governs current
product records; the original Space remains the historical source of native versions
and prior approval evidence.

## Authority and destinations

| Information | Canonical destination and representation |
|---|---|
| Catalogue | Tudo Macaé in Notion: root map, area Pages, capability or functionality Pages below their owning area |
| Shared product rules | One native Page or section at the scope shared by the affected functionalities; consumers link to it |
| Direction and business context | Root and linked context Pages, beginning with [Contexto e restrições](https://app.notion.com/p/3f684301eab381729f7beeac49c87944?pvs=204) |
| Product/business decisions | Dated sections in the affected Page; create a linked decision Page when its cross-functional scope or history requires one |
| Research and observations | Evidence sections in the affected Page, or a linked research Page when reused |
| Proposals | Native Pages under the owning area, explicitly distinguished from current contracts and availability |
| Domain vocabulary | Owning repository glossary through [CONTEXT-MAP.md](../../CONTEXT-MAP.md) and [Domain Docs](domain.md) |
| Architecture | [Repository ADRs](../adr/README.md) |
| Executable delivery work | [GitHub tracker](issue-tracker.md), linked to the applicable product record |
| Operating procedures | Applicable repository guide under `docs/agents/` |

The Notion root Page ID is `3f684301-eab3-81fd-b618-ca7626c9f609`. Use a Notion
Page ID for parent-child relationships. The root links the areas; [Blog](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a?pvs=204)
is the editorial area. Classificados includes Pessoas and Negócios with or without
Anúncios. Keep the original Space Page link as provenance on each migrated Notion
record. Use Notion Page IDs for ordinary evolution.

## Business documents stay out of the repository

The repository holds code, ADRs, glossaries, system operating guides and
`DESIGN.md`. Product contracts, business procedures, research, legal drafts,
findings, growth hypotheses, parked work and the planning procedure live only in
Notion: findings in [Achados](https://app.notion.com/p/fc624c69b3574cc4a9652121f9e7d4ad),
planning in [Procedimento de planejamento](https://app.notion.com/p/3ff84301eab381478aaed53eb84b459f).
Link to the Notion record instead of copying its content into the repository.
`PRODUCT.md` is generated from Notion and ignored by Git; see
[Impeccable artifacts](impeccable-artifacts.md#productmd).

An explicitly accepted replacement in Notion governs its scope; newer prose, code
or a deployed flag alone does not supersede a decision. Surface unresolved
contradictions and preserve their sources.

[Contexto e restrições](https://app.notion.com/p/3f684301eab381729f7beeac49c87944?pvs=204)
holds operating limits;
[Critérios de investimento e decisões abertas](https://app.notion.com/p/3f684301eab381af86d2eb0b218aba59?pvs=204)
owns acceptance criteria, selection states and D-row choices.

## Historical records

Beto Frega decided on 2026-10-24 that every product record written before that
date is historical until he reconfirms it, whether or not its Page carries the
"Registro histórico" callout. Citing one, label it historical and verify it
against code or with Beto. Reconfirm only when new work touches it: route the
choice through the decision queue of
[Gerente de Produto](https://app.notion.com/p/40384301eab3811194ecd9611d2132dd?pvs=204)
and remove the callout after the recorded decision.

## Native record mapping

Write Notion content in Brazilian Portuguese. Use Notion-flavored Markdown and
native references; retain equivalent existing headings when they already carry the
required meaning.

| Meaning | Native representation |
|---|---|
| Identity and organization | Page ID, title, parent area/capability, link in the parent, related-record links |
| Decision state and timing | `Autoridade e vigência` or an equivalent section; consolidated approved intent, proposals and future-effective rules with compact authority, approval sources and timing |
| Actors, segments, jobs and user stories | `Leitor e necessidade` or the applicable actor heading; role, conditions, situation, desired result and reason |
| Behavior | `Comportamento existente` for observations; `Regras de produto` for accepted outcomes, permissions, states, limits, exceptions and recovery |
| Value and costs | `Valor e custos`, with separate paragraphs for user value, user cost, business value and business cost; distinguish hypotheses from measurements |
| Revision history | Notion native Page versions; retain the original Space Page link for source history; current rationale and approval references stay compact in the contract, without interview narration or superseded values |
| Research and traceability | `Evidências e limites`, with sources, observation date, revision when available, coverage, unresolved gaps and links to decisions, contracts and work |
| Delivery | `Entrega e disponibilidade`, with distinct implementation, deployment, authorized release, observed exposure and flag observations |

Use the actor's recognizable outcome to determine functionality boundaries.
Several roles or segments can share a record; split materially different outcomes
or independently deliverable contracts. Mark unknown, unverified or inapplicable
meanings with the reason. Illustrations express replaceable interaction intent;
state binding rules in prose. Preserve explicitly approved controls as binding choices.
Before maintaining a living record, use the installed `product-documentation`
skill or its [pinned reference](https://github.com/BetoFrega/skills/blob/b3cee9b4b2729fb3ea74a601e204f6c62df3505d/skills/product-documentation/SKILL.md),
including its [record format](https://github.com/BetoFrega/skills/blob/b3cee9b4b2729fb3ea74a601e204f6c62df3505d/skills/product-documentation/references/record-format.md).
If neither source is readable, report the missing prerequisite and defer record
edits; continue independent authorized work.

Beto Frega is the product decision authority. Record explicit acceptance from the
conversation or another identified approval source. Agents maintain records within
the assigned documentation scope. Preserve future-effective choices separately
from behavior currently available. A product decision is not an architecture ADR.

## Discovery and writes

1. Read the root and relevant area, then list/search its descendants. Paginate when
   required; a partial result is not proof of absence. Reuse existing records.
2. Read the affected Notion Page and its parent. Update it using the supported
   Notion content format; preserve unrelated content, page properties and child-page
   blocks. Treat each child Page as its own record and verify the parent link.
3. Inspect every write receipt. Reconcile an unknown save by reading the same Page
   before another mutation. Verify the saved content and parent/related links.
4. Report accepted choices, observed behavior and remaining gaps separately.

On 2026-10-11, the Notion connection exposed page search, listing, reading and
editing tools. Verify access and the needed operations in each environment. Changing
or reviewing behavior governed by a migrated contract requires authenticated read
access to its current Notion Page. If unavailable, report the contract-access gap and
hold only work that depends on those rules. A historical repository or Space snapshot
does not establish the current contract. Prepare a clearly labelled draft or handoff
subordinate to Notion; it cannot establish compliance or replace the canon.

## Maintenance and evidence

After an accepted product decision or related implementation, deployment, release
or flag work, identify affected records and contradictory observations. Apply the
Notion-write authorization check below before reconciling them. Maintenance is
event-driven; no recurring job or periodic cadence has been configured.

Use code and relevant checks for implementation; deployment/provider evidence and
[production topology](production-topology.md) for environment presence; owner
approval for release scope; live guest or authorized audience journeys for actual
exposure; and evaluated provider/application configuration for flags through
[Feature Flags](feature-flags.md). Date the claim and state its audience and coverage.
Tests, deployment and flag configuration establish different dimensions.

Before each Notion write, verify that explicit user authorization covers the target
record and operation. Repository-only authorization requires a draft or handoff for
external record updates. Record maintenance preserves approved contracts and updates
supported evidence; new policies, release, provider writes, flag changes and schedules
require their own authority. Pass this reference and affected Page IDs to delegated
work. After authorized operational changes, read back actual state and apply the same
Notion-write authorization check to the linked records.
