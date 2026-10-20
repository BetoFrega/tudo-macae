---
name: bug-report
description: File a defect as a GitHub issue for Tudo Macaé, to this repo's house standard — verified against the code, measured where possible, with every affected call site enumerated and the right triage label. Use this whenever a real defect surfaces and should be recorded rather than immediately fixed: "open a bug for this", "file that", "log an issue", a broken behaviour found while reviewing or exploring, or a finding thrown off by another workflow (ideation work, a code review, an investigation). Also use it when asked to write up a bug someone else described.
---

# Bug Report

A defect report here is not a note that something feels wrong — it is a small piece of evidence work that leaves the next person (often an AFK agent) able to act without repeating your investigation. Look at #227 for the standard: mechanism, measurement, every affected site, fix options, provenance.

**A report is not a fix.** Filing is the deliverable. Don't fix the code on the way unless you were separately asked to — a ticket that arrives with the diff already applied removes the maintainer's chance to weigh the tradeoff, and the tradeoff is often the whole point.

## Before you file

**Verify it yourself in the code.** This is the rule that matters most. Findings arrive from subagents, reviews, and reasoning-at-a-distance, and a meaningful share of them are wrong — confidently written and falsified the moment someone opens the file. Read the actual source and confirm each link in the chain before filing. If the claim came from somewhere else, re-derive it; do not launder someone else's assertion into a ticket under your name.

**Measure it if the runtime can show you.** Reasoning tells you a bug is possible; a probe tells you it is real. #227 is persuasive because it pastes three identical probe runs against the emulators, not because its argument is clever. If you can reproduce against `npm run dev` or the e2e stack, do it and paste the output verbatim. If you genuinely can't, say which part is reasoned rather than observed — an honest boundary is worth more than a confident overclaim.

**Search for duplicates.** Query the tracker before writing. A second ticket for a known defect costs a maintainer more than silence would have.

**Ask whether it's one instance or a class.** The bug you noticed is usually one of several call sites with the same flaw. Grep for the pattern. A ticket that fixes one of five occurrences invites the same bug back next quarter.

## Writing the ticket

**Title: state the defect as a fact**, in the product's own vocabulary — *"Listagens de categoria e subcategoria não são invalidadas por nenhuma mutação de anúncio"*, not *"Bug: cache issue"*. It should be readable as a true sentence about the system, so someone scanning the list learns something without opening it.

**Language follows the subject.** Defects in the product domain are written in pt-BR, using the `CONTEXT.md` glossary (anúncio, anunciante, interessado, perfil de anunciante, negociação). Defects in the toolchain — CI, e2e harness, dependency and build problems — are written in English, like the code they describe. This mirrors `AGENTS.md`: the product speaks pt-BR, the machinery speaks English.

**Body**, adapted to what the defect actually needs — these are the sections that keep earning their place, not a form to fill:

- **The mechanism, first, with real citations.** Open with what is broken and why, quoting `file:line` or grep output. Lead with the finding; don't build up to it.
- **The measurement.** Reproduction steps and the actual output. Say what was controlled for — #227 notes the probe runs *after* the delete's own invalidation is known to have applied, which is what makes it evidence rather than anecdote.
- **The blast radius.** A table of affected call sites, what each does today, and what it's missing, when there is more than one. Also name the most user-visible case explicitly; it is often not the one you found first.
- **Why the tests don't catch it.** If a suite should have caught this and didn't, that is a second finding and often the more important one.
- **Fix options.** Sketch them, with their tradeoffs. **Say plainly when you are not choosing** — "the performance cost of that is a decision for whoever knows the traffic" is a legitimate and useful ending. Deciding a tradeoff you lack the context for is worse than leaving it open.
- **A palliative, if one exists.** What reduces the damage now without committing to a fix. Label it as palliative so nobody mistakes it for the resolution.
- **Provenance.** Where this was found, and — if it lives near another issue — what it is *not*. #227 spends a paragraph disentangling itself from #225, which is exactly the kind of thing that saves a maintainer an hour.

End with the attribution footer:

```markdown
---
_Generated with an AI coding agent_
```

## Triage label

`docs/agents/triage-labels.md` holds the canonical vocabulary.

**When the defect is your own out-of-scope finding, there is no judgment call**: `AGENTS.md` fixes the label at `needs-triage`, because whoever finds it is not whoever prioritises it. Never mark your own finding `ready-for-agent`. What follows applies when filing is the task you were handed.

The judgment call is between two of them:

- **`ready-for-agent`** — the defect is fully specified, the fix is mechanical, and no decision is left open. An AFK agent can pick this up and finish it.
- **`needs-triage`** — a human has to weigh something first: a performance tradeoff, a product decision, two defensible fixes. #227 is this case, and correctly so.

`ready-for-human` when the fix needs judgment or access an agent doesn't have. When in doubt, `needs-triage` — it costs a maintainer a glance, whereas a wrongly-`ready-for-agent` ticket costs a wrong fix.

Add `idea:*` labels only if the ticket is genuinely part of an ideation thread; a defect found *during* an ideation run is still just a defect.

## When the finding came from another workflow

Ideation runs, code reviews, and exploratory work throw off defects as a side effect — often the most valuable thing they produce. One thing keeps that from going wrong:

Verify before filing, as above. The report will be attributed to this session, so its claims have to be ones you checked yourself.

Once verified, file it — including on unattended/scheduled runs, without waiting for confirmation. Filing is cheap and the ticket itself is the record; validating whether it's worth acting on is the job of whoever picks it up, not a gate you need to clear first. Still surface the finding in whatever summary or notification the run produces (a filed ticket that only shows up in the tracker, with nobody told it exists, has half-reached its audience) — but surface it *as filed*, not as a proposal awaiting a yes.
