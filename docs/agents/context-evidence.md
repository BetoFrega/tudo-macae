# Context-path evidence

Use this record only when auditing or revalidating the repository's information
architecture. The active routing contract is [Context path scenarios](context-paths.md);
these measurements are diagnostic evidence, not size limits.

## Final review · 2026-08-28

All 16 scenario rows in the matrix were reviewed against the final pointers. Each path
reaches its named authority without loading a sibling branch:

| Route family | Scenarios reviewed | Result |
|---|---|---|
| General work | Ordinary code task | Domain and package authorities remain conditional. |
| Testing | Unit selection; API Worker-backed integration; E2E authoring | Selection, harness operation and Playwright authoring stay independent. |
| Tracker | Common operation; executable ticket; external PR triage; Wayfinder | The common protocol exposes each specialized branch only when its trigger fires. |
| Product | Product planning | Sweep routes to the active register and canonical ledgers before conditional evidence. |
| Ideation | Generate; validate an existing idea | Explicit Product Ideation invocation loads grounding plus divergence or validation, respectively. |
| Production | Edge/cache; crawling; configuration; infrastructure adoption; provenance | Delivery, crawling, operations, adoption and evidence each have independent triggers. |

The retired workflow identifiers `idea-pipeline`, `Idea Pipeline` and `idea pipeline` <!-- context-reference: historical -->
are guarded by [the retirement registry](../../.agents/context-retirements.json). The
harness permits them only on a line marked `<!-- context-reference: historical -->`,
so historical evidence remains accessible without joining an active route.

## Impeccable lifecycle review · 2026-08-31

The two Impeccable scenarios were followed from `AGENTS.md`. Starting, resuming,
stopping or cleaning live and ordinary artifact handling load the active
[artifact policy](impeccable-artifacts.md). The dated
[lifecycle evidence](impeccable-live-evidence.md) remains out of the normal route and
loads only when the installed runtime or procedure is audited or revalidated. Interface
delivery still reaches documenter maintenance without loading runtime evidence, tracker
transfer or ADR criteria unless those branches trigger independently.

## Measured route load

### Context-map migration · 2026-09-16

The domain scenarios were followed from `AGENTS.md` through `CONTEXT-MAP.md`. A named
concept or associated path reaches its owning glossary; an administrative operation
also reaches the entity owner; Agent Harness and Test Harness stay independent; an
ambiguous task widens from candidate glossaries to the complete set. Cross-references
do not load transitively.

The retired root glossary contained 319 lines / 21,214 bytes. Current direct loads are:

| Route | Lines | Bytes | Byte change from the root glossary |
|---|---:|---:|---:|
| Map + Classificados | 167 | 8,730 | -59% |
| Map + Editorial | 248 | 15,247 | -28% |
| Map + Mídia | 139 | 7,109 | -66% |
| Map + Administração | 120 | 5,777 | -73% |
| Map + Agent Harness | 131 | 6,309 | -70% |
| Map + Test Harness | 132 | 6,417 | -70% |
| Fallback: map + every glossary | 412 | 24,604 | +16% |

The fallback increase is accepted because it preserves all applicable language when
ownership cannot be proved; it is not a normal route. Measurements use
`wc -l -c CONTEXT-MAP.md docs/contexts/*/CONTEXT.md`; the baseline uses
`git show HEAD:CONTEXT.md | wc -l -c` from the migration worktree before commit.

The following values were measured on 2026-08-28 with the command shown below. A
branch's after value is its direct route load; sibling branches are not summed into it.

| Route | Before | After |
|---|---:|---:|
| Resident instructions | 217 lines / 12,370 bytes | 84 lines / 5,322 bytes |
| Test selection | 545 lines / 25,152 bytes | 67 lines / 2,691 bytes |
| Harness operation | 545 lines / 25,152 bytes | 101 lines / 3,773 bytes |
| E2E authoring | 545 lines / 25,152 bytes | 91 lines / 3,242 bytes |
| Common tracker operation | 162 lines / 11,236 bytes | 73 lines / 3,271 bytes |
| Executable-ticket preparation | 162 lines / 11,236 bytes | 65 lines / 2,895 bytes |
| External-PR triage | 162 lines / 11,236 bytes | 18 lines / 931 bytes |
| Wayfinder operation | 162 lines / 11,236 bytes | 25 lines / 1,531 bytes |
| Product-planning ledger set | 1,212 lines / 68,729 bytes | 845 lines / 49,068 bytes |
| Historical product evidence | Included in the prior planning set | 418 lines / 20,619 bytes, conditional |
| Edge/cache investigation | 276 lines / 14,761 bytes | 110 lines / 5,187 bytes |
| Crawling investigation | 276 lines / 14,761 bytes | 69 lines / 3,015 bytes |
| Production configuration | 276 lines / 14,761 bytes | 57 lines / 2,350 bytes |
| Infrastructure adoption | 276 lines / 14,761 bytes | 18 lines / 1,032 bytes |
| New product idea | 117 lines / 13,447 bytes | 49 lines / 2,338 bytes |
| Existing-idea validation | 117 lines / 13,447 bytes | 50 lines / 2,408 bytes |

The Product Ideation totals combine its 27-line router with grounding and the branch
for that scenario. The product-evidence row is deliberately separate because the
sweep loads it only when a recorded recheck condition fires.

## Reproduce the measurements

Use `git cat-file -s <revision>:<path>` for bytes and
`git show <revision>:<path> | wc -l` for lines. The comparison revisions are:

| Route family | Before revision | After revision |
|---|---|---|
| Resident instructions | `be6c8fb^:AGENTS.md` | `f4acbb7:AGENTS.md` |
| Testing | `1993b79^:docs/agents/testing-guide.md` | `f4acbb7:docs/agents/{test-selection,test-harness-operation,e2e-test-authoring}.md` |
| Tracker | `b14d74e^:docs/agents/issue-tracker.md` | `f4acbb7:docs/agents/{issue-tracker,executable-tickets,pull-request-triage,wayfinder-tracker}.md` |
| Product ledgers | the six planning files at `85db477^` | the same six files at `f4acbb7`, with `findings-evidence.md` separate |
| Production | `67fb6b4^:docs/agents/production-topology.md` | `f4acbb7:docs/agents/production-*.md` |
| Product Ideation | `f4acbb7^:.agents/skills/idea-pipeline/SKILL.md` | router and triggered references at `f4acbb7` | <!-- context-reference: historical -->

For every before/after pair, run `pnpm run check:harness` after the current-tree
measurement. It verifies internal pointers, destination existence and active references
to retired context.
