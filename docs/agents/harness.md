# Agent harness

The repository has one behavioral source and thin discovery adapters:

| Surface | Canonical source | Adapters |
|---|---|---|
| Always-on rules | `AGENTS.md` | `CLAUDE.md` symlink; Antigravity and Codex read it directly |
| Skills | `.agents/skills/` | One `.claude/skills/<name>` symlink per skill |
| Hook scripts | `.agents/hooks/` | `.claude/settings.json`, `.agents/hooks.json`, `.codex/hooks.json` |

Edit the canonical source. An adapter contains paths, matchers, timeouts and protocol
translation only; it does not restate policy.

## Changing skills

Add or update the folder under `.agents/skills/`, then create the matching Claude
symlink:

```text
.claude/skills/<name> -> ../../.agents/skills/<name>
```

Keep shared skill instructions independent of agent-specific tool names and
attribution. Put protocol-specific behavior in an adapter or describe it by outcome,
such as “launch an exploration subagent.”

### Repository-specific scope

Keep only skills that encode Tudo Macaé workflows, domain contracts or concrete
repository operations. Install reusable engineering, design and productivity skills
outside the repository. Remove a retired skill's Claude symlink, lock entry and active
callers together; retain project policies and user artifacts independently.

`skills-lock.json` retains an empty skills map while no upstream skills are installed.
The checker still validates exact directory hashes if upstream entries are introduced.

## Changing hooks

The Impeccable adapter resolves the user installation from `~/.agents/skills`,
`$CODEX_HOME/skills` (default `~/.codex/skills`), `~/.claude/skills`, then Claude's
user plugin registry. It calls the current `scripts/impeccable hook` launcher or the
legacy `scripts/hook.mjs`; an absent installation is a no-op. Codex, Antigravity and
Copilot invoke this shared adapter. Claude receives its hooks from the user plugin.


The shared edit hooks accept the payload shapes emitted by all three agents. Stop
hooks need wrappers because Codex and Antigravity require different continuation
JSON. Keep that translation in `codex-green-gate.sh` and
`antigravity-green-gate.sh`; the verdict remains in `green-gate.sh`.

Codex cannot return an interactive `ask` decision from `PreToolUse`. Its protected-file
adapter therefore denies the edit and tells the operator to confirm, temporarily
disable that hook in `/hooks`, make the edit, and re-enable it. Claude Code and
Antigravity can ask directly.

Project-local Codex hooks require trust after their definition changes. Review them in
`/hooks`; an untrusted hook is skipped.

## Verification

The [context path scenarios](context-paths.md) are the behavioral review seam. They
distinguish the resident surface, triggered pointers, loaded documents and branches that
stay outside each task. Keep the matrix aligned with context-routing changes; it is not a
central pointer manifest.

The [context retirement registry](../../.agents/context-retirements.json) is the
mechanical source. The checker rejects its literal references in Markdown unless the
preserving line ends with
`<!-- context-reference: historical -->`. Use that marker only for historical evidence,
never for current guidance.

Run:

```bash
npm run check:harness
```

The checker requires the rule and hook symlinks, validates skill frontmatter and exact
Claude mirrors, verifies every upstream-locked skill directory against
`skills-lock.json`, rejects the legacy `.agent/` layout, verifies hook configuration
points at the canonical scripts, and checks executable bits. It also holds the script
menu together: `bin/scripts-help.mjs` and `package.json.scripts` must name the same set,
and no tracked file may cite a script name that was removed. Relative Markdown links and
root-relative repository paths declared in `AGENTS.md` must resolve; explicitly retired
references may survive only as marked history. The checker evaluates integrity, not prose
quality or file size.
It also validates numbered ADR metadata, canonical ID uniqueness, filename/title
identity and explicit relocation pointers. Product-versus-architecture classification
is a semantic review under [Domain Docs](domain.md), not a keyword heuristic.
`npm run lint` includes it, so the same invariants run in CI.
The commit and CI entry points also enforce the
[Impeccable artifact policy](impeccable-artifacts.md) against their Git snapshot.
