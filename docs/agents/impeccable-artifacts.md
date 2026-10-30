# Impeccable artifacts

## Versioning

The repository's `.gitignore` is the executable classification policy for Impeccable
artifacts, at the root and in nested workspaces. Its default is local-only, including
unknown outputs and the runtime layouts still supported by the installed skill.
Only the general shared configuration, structured design synthesis and shared live
configuration receive automatic exceptions. Inspect the exact paths and matching rules
with `git check-ignore --verbose --no-index <path>`.

The documenter's readable documentation (`DESIGN.md`) remains versioned alongside
its structured synthesis. Production assets and test baselines retain their own
policies. Moving exploration output into those areas does not make it a production
asset or a baseline.

### PRODUCT.md

`PRODUCT.md` is generated and ignored: its content lives only in the Notion page
[Visão de produto](https://app.notion.com/p/3ff84301eab3814e9740df573046a187).
Before running Impeccable, run `pnpm run product:sync` with `NOTION_TOKEN` set to an
integration that can read that page. Change the product vision in Notion, never in
the generated file.

An additional exception needs an exact file path and a durable reason in the same
reviewed `.gitignore` change. Reopen only the ancestors necessary to reach that file,
keeping their other contents ignored. Do not exempt a directory or artifact category.
Keep project policy here rather than editing upstream-locked skills or restating it
in agent adapters.

## Pull-request visual evidence

Every PR with relevant interface changes must include visual evidence in its body,
regardless of whether Impeccable was used. Relevant changes affect visible layout,
styling, content hierarchy, responsive behavior or user-facing interaction states.

1. Capture screenshots of the running implementation at the PR revision, covering
   each materially changed screen or state and the viewports affected by the change.
   Use a recording when the behavior requires a sequence or motion to assess; include
   a before view when needed to understand the difference. Use non-sensitive test data.
2. Upload the captures as GitHub attachments and embed the images directly in the
   PR body under a visual-evidence section. Use `gh pr create` or `gh pr edit` with
   `--body-file` and `--attach` when the installed command supports it; otherwise
   attach the images through the GitHub web editor for the PR body. The result must
   render the images in the description itself. Label each with its route,
   state, viewport and captured commit. Local paths, mockups and test-pass summaries
   do not substitute for evidence of the implemented interface.
3. Read back the PR body and open its media to verify that reviewers can view every
   capture. Refresh affected captures after subsequent interface changes. Delivery
   is complete only when the body contains accessible evidence matching the final
   interface; if capture or publication is blocked, report the blocker and keep this
   requirement pending.

For a PR without relevant interface changes, no visual evidence is required. Apply
the versioning and preservation rules in this document to local capture files.

## Documenter maintenance

Every interface delivery compares its completed implementation with `DESIGN.md` and
`.impeccable/design.json`. A reusable change to tokens, typography, spacing, component
behavior, layout grammar or another system rule updates both outputs from the shipped
code. `DESIGN.md` remains the readable synthesis; its frontmatter owns normative token
primitives. The sidecar carries only its structured extensions, such as ramps,
elevation, motion, breakpoints and self-contained component examples. Keep their shared
rules coherent without copying a value into two authorities.

An isolated screen-level change records no artificial document diff. State the review
outcome in the delivery evidence instead. When a system change is present, inspect the
existing synthesis before updating it, preserve confirmed rules that still match the
implementation, and keep the documenter's canonical section order and sidecar contract.
The documenter describes implemented behavior; a planned direction never becomes a
design-system rule merely because it appeared in a brief or critique.

Curate working material at its durable destination:

- A visual rule evidenced by the implementation belongs in the synthesis.
- A durable architectural decision follows the ADR criteria in
  [`Domain Docs`](domain.md).
- An unimplemented recommendation belongs in the tracker.
- Context already recoverable from code, tests or another canonical source stays there.

Record only the decision and its reason when it is needed by a future maintainer. Do
not turn a brief, critique or session transcript into parallel documentation. A
reference that becomes an implementation or review requirement remains accessible from
its spec or ticket with its approved revision and scope; local paths and ignored copies
are working material, not that authority.

## Preservation

Ignored means local, not disposable. Preserve images, mocks, references, briefs,
critiques and sidecars. Upload, commit, merge, ticket closure and session completion
never authorize local deletion. For a generic cleanup request, present a concrete
per-file inventory with the reason for deletion and recovery status, then wait for scope
approval. An exact list already authorized needs no second confirmation. Before deleting,
confirm that the item belongs to the authorized session and is not the only necessary
copy. Uncertain ownership or recovery preserves the item; authority for one session never
extends to another. Do not apply age-based expiry or broad directory and worktree cleanup.

Before adopting or changing the policy, inventory tracked artifacts with
`git ls-files` and inspect local outputs separately, including ignored files.
Classify any tracked artifact outside the shared entries and preserve its necessary
content before proposing selective removal from the index. A preservation uncertainty
blocks that removal. Keep local copies and history intact; if the inventory contains
only shared entries, record that no migration is needed in the ticket or PR.

## Live lifecycle

Resolve Impeccable from the current skill catalog; its runtime is installed outside
this repository. `<installed-skill-scripts>` denotes that installation's scripts directory.

Starting, resuming and stopping live are process operations, not deletion authority.
Treat them independently from artifact cleanup. Work from the resolved app root in the
current project or worktree, and keep agent-chosen scratch output under its ignored
`.impeccable/` tree. Use the fixed paths reported by the installed helpers; do not invent
flags or write temporary output into the locked skill installation or production source.

Before invoking `live.mjs`, `live-server.mjs`, `live-status.mjs`, `live-resume.mjs` or a
completion helper:

1. Resolve and record the repository root and app root. The `roots.json` manifest is the
   authority after boot; a helper run from another directory must re-anchor to it.
2. Record the source state with `git status --short` and inspect the applicable diff.
   This protects legitimate concurrent edits, but it is not the artifact inventory.
3. Inventory files separately under `.impeccable/live/`, legacy `.impeccable-live/`,
   `node_modules/.impeccable-live/` and the operating-system temporary path derived by the
   installed runtime. Include ignored files. Correlate session journals and snapshots,
   annotation directories, manual-edit evidence and transactions, accept receipts, preview
   modules, injection and roots journals, briefs, critiques and sidecars. Attribute an item
   to the current execution only when its session id, journal or manifest proves that
   relation; otherwise classify it as another session or unknown and preserve it.
4. Inspect the installed runtime before any command that may mutate or remove content:

   ```bash
   rg -n 'shutdown|sessionDir|rollbackTransaction|applyLegacyDeferredAcceptsOnStartup|sweepStaleAcceptReceiptsOnStartup|sweepOrphanSvelteComponentSessionsOnStartup|pruneStaleEvidence|removeAllSvelteComponentSessions' <installed-skill-scripts>
   ```

When auditing the installed runtime or after a skill update, read the dated
[live lifecycle evidence](impeccable-live-evidence.md). It records why the inspected
revision is incompatible with implicit deletion authority; treat another revision as
unverified until the inspection and isolated scenarios are repeated.

Apply this compatibility gate:

- **Start or resume:** `live-resume.mjs` may read an interrupted journal to identify the
  pending action, but restarting the helper applies the same gate as a fresh boot.
  Continue with that boot only when the inventory proves that startup reconciliation
  cannot delete material or overwrite a legitimate source change, or when the user has
  explicitly authorized the exact affected files. A surviving manual-edit transaction,
  deferred accept, inactive preview, stale receipt or unreferenced evidence blocks the
  restart without that authorization. Read journals directly for the inventory; a status
  helper is not a substitute for inspecting the installed effects.
- **Stop:** first identify the live helper as the process recorded for this app root and
  inspect its active journals, annotation directory, preview trees, injection journal and
  current source diff. Use the official `live-server.mjs stop` only when every artifact it
  will remove is covered by exact deletion authority and no concurrent source edit will
  be overwritten. Preserving a copy, transferring an image or using `--keep-inject` does
  not supply that authority. When the gate fails, report that live remains running and
  why; do not call the command or report shutdown as complete.
- **Complete:** after an authorized stop, inspect the source diff and injection journal,
  then run `pnpm run check:harness` to invoke the shared production-residue detector. A
  clean detector plus a stopped owned process proves completed shutdown. A blocked stop
  or a detector failure is a pending path, not completion evidence. Preserve the session
  journals and all other artifacts outside the exact authorized deletion list.

## Verification

The commit hook invokes `pnpm run check:harness --staged` before lint-staged.
The artifact check reads every entry and every tracked `.gitignore` from the index;
unstaged fixes or local ignore overrides cannot hide staged violations. It also works
before the first commit. The existing lint-staged rules keep their own behavior.

Without `--staged`, `pnpm run check:harness` checks all of `HEAD`, as delivered to CI,
including prohibited artifacts unchanged by the current diff. After editing the
policy locally, stage that policy and use `--staged` to validate it before committing.
`--artifacts-root <path>` selects another Git repository for this check only.

Both modes use the same verifier and Git's ignore matching. Each violation reports
its path and matching rule, then blocks. Only versioned ignore files participate;
global excludes, `.git/info/exclude` and working-copy changes cannot change the result.
The verifier creates temporary copies of the ignore policy, removes only those copies,
and leaves the source repository, index and artifacts unchanged. A failed check is
not authorization to delete or unstage anything.

The same snapshot check also reads production source under `src/`. It rejects static,
re-exported, dynamic and CSS imports whose specifier enters `.impeccable` or
`.impeccable-live`, including relative paths and the project's `@/` alias. It also
rejects the live markers emitted by the installed runtime, such as its injection
blocks, preview wrappers, `data-impeccable-*` attributes and unbaked preview
parameters. Tests, documentation and the upstream-locked skill remain outside this
production-source scan, so their legitimate marker definitions do not block delivery.
Use the live shutdown procedure to remove instrumentation deliberately; this check
only reports it and never decides whether artifacts are still useful, visually
approved, transferred or authorized for deletion.

The check does not prove tracker transfer, independent recovery or visual
approval. Validate documenter maintenance separately in an isolated copy: make
one synthetic reusable pattern change and confirm that the readable and structured syntheses stay coherent;
then make an isolated change and confirm that neither synthesis needs rewriting. Use
controlled examples to classify a durable decision, a recoverable duplicate and an
unimplemented recommendation by the destinations above. This is documentary judgment,
not a mechanical artifact-check guarantee.

Review the live lifecycle in an isolated synthetic project, never against the user's real
artifact collection. Cover old material at start and stop, absent deletion authority, a
generic cleanup request, an exact authorized list, a necessary sole copy and a legitimate
concurrent source edit. For every case, record the inventory, command allowed or blocked,
files preserved or removed, process state, source diff, journal state and detector result.
Only a case that actually runs the compatible official stop and passes the detector proves
completed shutdown; preserve or abandon the synthetic fixture according to its own
declared test scope.
