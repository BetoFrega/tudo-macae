<!-- eslint-disable local/no-expired-notes -->
---
record: adr
id: "0002"
status: accepted
decided: 2026-08-12
---

# 2. Expiring notes for temporary workarounds

## Context

Temporary workarounds outlive their reason. The immediate case was #248, which pinned TypeScript below 6.1 because `@typescript-eslint/parser` cannot run on TypeScript 7. That hold is correct today and wrong the moment typescript-eslint ships TS 7 support — but nothing about it fails, so the repo would quietly stay on an old TypeScript with Dependabot no longer offering the upgrade.

The usual answers do not hold up:

- **A comment explaining the workaround.** The comment was already there. Comments are read when someone is already looking at the file, which is exactly when the workaround is not the problem.
- **An issue in the tracker.** Better, but it competes with every other open issue for attention and has no connection to the code it describes.
- **A calendar reminder.** Belongs to one person and does not survive them leaving the project.

What these share is that noticing is voluntary. The workaround only surfaces if someone goes looking.

## Decision

A dated marker in a comment, enforced by lint:

```yaml
# @expires 2026-11-03 re-check whether typescript-eslint supports TS 7 (#256)
```

The `local/no-expired-notes` ESLint rule (`eslint-rules/no-expired-notes.js`) fails the build the day after the date passes. `npm run lint` runs in CI on every PR, so an expired note blocks merges until someone deals with it.

Two responses are legitimate, and the rule does not favour either:

- **Resolve it** — the reason is gone, remove the workaround and the marker.
- **Bump the date** — the reason still holds. The rule offers an editor suggestion that moves the date three months out.

Bumping is not a failure mode. The point is a forced decision at a known interval, not a deadline anyone is accountable for hitting.

### Implementation notes

The rule scans raw file text rather than the comment AST, so one implementation covers every language configured here: YAML, JS/TS, JSON, CSS and Markdown. The trade-off is that a marker inside a string literal counts too — acceptable, since a repo-wide deadline should be found wherever it is written.

A malformed date (`@expires soon`, `@expires 2026-02-31`) is an error, not a skip. A marker that looks live but guards nothing is worse than no marker.

The rule offers a **suggestion**, never an autofix. `lint-staged` runs `eslint --fix` on every commit, and an autofix would silently push every deadline forward on commit — precisely inverting the rule's purpose. ESLint does not apply suggestions during `--fix`, so bumping stays a deliberate act.

## Consequences

### Positive

- A workaround announces itself instead of waiting to be found.
- The prompt reaches whoever is working that week, not one person's calendar.
- The marker sits on the code it describes, so the context is right there.
- Works in any linted file type, including config files like `.github/dependabot.yml` where this kind of debt tends to collect.

### Negative

- A red build for something that is not a regression. This is the cost of the mechanism: to be noticed, it has to interrupt.
- Bumping the date is the path of least resistance, and a marker can be pushed forward indefinitely without anyone reconsidering. The rule surfaces the decision; it cannot make it a good one.
- Dates get chosen carelessly, since nothing validates that the interval is sensible.
- `eslint-rules/**` is excluded from the rule, because the rule's own source and tests contain example markers with past dates.
- **Any document that names the marker has to disable the rule.** A raw-text scanner cannot tell a live deadline from prose describing the syntax, and even the placeholder `@expires YYYY-MM-DD` reads as a malformed date. `AGENTS.md` and this ADR both carry `<!-- eslint-disable local/no-expired-notes -->`, and any future doc that mentions the marker will need one too. Teaching the rule to skip placeholders was considered and rejected: it would create exactly the "looks live, guards nothing" case the strictness above exists to prevent.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0002-expiring-notes.md) preserves earlier dated wording and superseded clauses.
