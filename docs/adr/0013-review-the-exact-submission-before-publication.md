---
record: adr
id: "0013"
status: accepted
decided: 2026-08-27
---

# 13. Recoverable publication of the exact version across package boundaries

## Context and requirements

The [editorial contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) requires publishing the
exact current Submission with valid evidence and safe Media. Firestore and Storage
do not share one transaction; activating objects first could expose orphaned content.

## Decision

Create a durable PublicationAttempt bound to Submission, target Article, exact Media
IDs, sanitized digests and expected revisions. Media processes that attempt
idempotently and returns a receipt bound to the data after eligible activation/grants.
The final Article commit accepts only that receipt and the still-current Submission.
Public delivery checks both grant and published Article. Reconcile pending attempts;
conflict preserves the reader-visible state.

At publication recheck Story/Article/Media revisions, valid Captures, permissions and
Media readiness without fetching external URLs again. Unpublishing removes only that
Article's grants/projections, not shared Media. Canonical metadata corrections retain
MediaRevision and propagate under [0004](0004-media-as-an-autonomous-library-with-closed-kinds.md).

## Alternatives and consequences

Treating object storage and document writes as atomic creates partial public state.
Durable attempts and receipts add coordination/reconciliation but prevent interrupted
publication exposing an orphan. UI, MCP and CLI use the same module and exact-version
boundary; revisions detect an intervening change instead of silently replacing input.

## Scope and amendments

On 2026-09-11 human-interface-only publication/correction was superseded. Queues,
review actions, blockers, warnings and notifications belong to the editorial contract;
the technical receipt requirement remains. Edition identity/history follow
[0036](0036-single-article-identity-with-edition-history.md).

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0013-review-the-exact-submission-before-publication.md) preserves earlier dated wording and superseded clauses.
