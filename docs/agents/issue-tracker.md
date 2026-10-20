# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for common
operations and infer the repository from `git remote -v`.

## Diagnostic records

Publish investigation findings, reproduction evidence, validation outcomes and
unresolved failures in the relevant issue; link that record from the PR. The issue
tracker is the canonical diagnostic history. Keep case-specific diagnostic Markdown
out of version control. Local drafts belong in a temporary directory outside the
checkout; generated test artifacts may remain in their ignored report directories.
Before handing off, read back the tracker record and verify that it contains the
conclusions, evidence links and pending work needed to continue without local drafts.
Repository documentation holds reusable rules and procedures, not individual run
diaries.

## Common operations

- **Read**: `gh issue view <number> --comments`; include labels and filter comments
  with `jq` when the task needs structured output.
- **List**: `gh issue list --state open --json number,title,body,labels,comments`
  with the applicable labels and state filters.
- **Create**: `gh issue create --title "..." --body-file <path>`.
- **Comment**: `gh issue comment <number> --body-file <path>`.
- **Edit a body**: `gh issue edit <number> --body-file <path>`.
- **Edit a comment**: `gh api --method PATCH repos/<owner>/<repo>/issues/comments/<comment-id> -F body=@<path>`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or
  `--remove-label "..."`.
- **Verify a configured label**:
  `gh label list --limit 200 --json name --jq '.[] | select(.name == "<label>") | .name'`.
- **Create a configured label**, only when the active task authorizes tracker
  configuration: `gh label create "<label>" --description "..." --color "<hex>"`.
- **Close with a resolution**: publish the resolution comment, verify it, then run
  `gh issue close <number>`.
- **Claim**: `gh issue edit <number> --add-assignee "@me"`.

Write multi-line Markdown to a temporary `.md` file with real newlines and pass it via
`--body-file`. A quoted heredoc (`<<'EOF'`) keeps backticks and shell syntax literal.
Reserve `--body "..."` for short single-line text without shell-sensitive characters.
After publishing multi-line content, read it back and verify its Markdown, line breaks
and inline code.

Before executing a ticket, read its current state, assignees and blockers. Proceed only
if it is open and has no open blocker. If unassigned, assign it to yourself with
**Claim** above and read the issue back to confirm the assignment before editing. If
already assigned to you, continue after the state and blocker check. If another person
owns it or the eligibility check fails, report that state instead of taking it over.
Triage alone does not claim a ticket. If no ticket is available, report the nearest
candidates and their blocking or assignment state.
Offer to monitor a blocker when a monitoring mechanism is available.

## Low-information-density reports

The configured labels are `low-info-density` for the additive category and
`needs-triage` for the workflow state. The reporting skill owns construction of the
deterministic `low-density-fingerprint: sha256:<hex>` value.

Immediately before creating a report, search open issues carrying the category and
exact fingerprint:

```bash
gh issue list --state open --label "low-info-density" \
  --search '"low-density-fingerprint: sha256:<hex>" in:body' \
  --json number,title,url,body,labels
```

Create an issue only when that search returns no match, applying both configured
values:

```bash
gh issue create --title "‼️ LOW INFORMATION DENSITY ‼️ — <short source>" \
  --body-file <path> --label "low-info-density" --label "needs-triage"
```

Repeat the fingerprint search immediately after creation and read the resulting issue
with `gh issue view <number> --comments`. An uncertain create is searched once and is
never retried. Reading an assigned report with its discussion, adding one findings
comment and reading that comment back use the common read and comment operations
above.

## Fallback access

When `gh` is unavailable, use the GitHub MCP tools. Derive owner and repository from
`git remote -v`; MCP calls do not infer them.

| Operation | MCP tool |
|---|---|
| Create or edit issue | `mcp__github__issue_write` |
| Read issue | `mcp__github__issue_read` |
| List or search | `mcp__github__list_issues`, `mcp__github__search_issues` |
| Comment | `mcp__github__add_issue_comment` |
| Sub-issues | `mcp__github__sub_issue_write` |

Pass Markdown directly as a string and apply the common read-back verification above.
Native issue dependencies have no MCP tool. When `gh api` is unavailable, put
`Blocked by: #<n>, #<n>` at the top of the body and record that the native edge remains
to be added. The frontier query already accepts this fallback.

## Closing an issue from a pull request

The PR body must carry an English closing keyword: `Closes #123`, `Fixes #123` or
`Resolves #123`. A translated keyword or a bare issue mention does not close the issue
on merge. Apply `no-issue` only when a change genuinely has no issue.

A delivery-repair PR is the exception: its body carries one `Repairs delivery #123`
line pointing to the open automated delivery incident, and it is labeled `no-issue`.
That non-closing reference keeps the incident open after merge; the delivery workflow
is the sole authority that closes it after checks and production verification succeed.

## Executable-ticket preparation

Before preparing an actionable ticket or recommendation, read
[Executable Tickets](executable-tickets.md).

## Parent spec state and resume point

A parent spec keeps a `## Estado e retomada` section at the top of its body. It is
the single place a later session reads to continue the spec, so it states:

- what is delivered and where it runs (PRs, deployed revision, operating doc);
- the ticket to resume from, the first action, and any time or event it waits for;
- the remaining tickets and their order, or that they have none;
- standing rules that constrain the rest of the work.

When work on a child ticket ends — merge, deploy, handoff or session end — update this
section in the same step. Keep the parent's sub-issues current: attach new child
tickets, and close superseded children with a comment that names where each remaining
criterion moved. The section records status and pointers only; evidence stays in the
child ticket's comments.

Rewrite the section as a snapshot; do not append a paragraph per child. List delivered
children as one table row each (child, PR, merge commit, date, one-line scope, link to
its evidence comment). State a qualifier shared by several rows, such as deployment
status, once above the table, and mark only the rows that differ. Keep one resume
point for the spec, not one per delivered child.

## Visual references

When a visual exploration becomes a selected requirement, or when preparing,
implementing or reviewing a ticket bound to one, read
[Visual Reference Transfer](visual-reference-transfer.md). It owns the tracker record,
approval, transfer, revision and independent-recovery contract. Local versioning and
preservation remain in [Impeccable Artifacts](impeccable-artifacts.md).

## Pull-request visual evidence

When preparing or updating a PR with relevant interface changes, follow
[Pull-request visual evidence](impeccable-artifacts.md#pull-request-visual-evidence)
for capture, publication in the PR body and completion verification.

## Pull-request triage

When triage includes pull requests, read
[Pull Request Triage](pull-request-triage.md) for the repository flag and operations.

## Wayfinding operations

When creating or operating a map, read [Wayfinder Tracker](wayfinder-tracker.md).

## Skill vocabulary

When a skill says **publish to the issue tracker**, create a GitHub issue. When it says
**fetch the relevant ticket**, run `gh issue view <number> --comments`.
