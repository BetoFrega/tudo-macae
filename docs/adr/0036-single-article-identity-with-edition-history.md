---
record: adr
id: "0036"
status: accepted
decided: 2026-09-11
---

# 36. One Article identity with immutable effective Edition history

## Context and requirements

[Editorial workflow](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) requires exact Submissions,
mutable current work, classified published changes and preserved history. Splitting
Article, Draft and Submission into identities the caller coordinates fragments the
workspace; rewriting public content in place would erase the prior state.

## Decision

Article is the enduring identity. Draft data is mutable working content; each Submission
is an immutable send; each PublicationReceipt is an immutable effective Edition. One
current Edition and prior immutable Editions/receipts preserve every published change.
A strict patch plus expected revision/receipt commits the complete resulting content
atomically. The shared interface composes existing storage behind one deep module.

Keep lifecycle and visibility separate: status and publishedAt plus a valid current
receipt are sufficient. Scheduled/visible are derived outcomes, not extra persisted
states; isVisible may be a calculated convenience. Publication time is separate from
Edition content. Read returns current complete content/evidence/Media, expected identity,
current Submission where present and concise history.

Normalize an existing legacy Article lazily on its first new-flow mutation: preserve
its public state as the first receipt before applying the next Edition. Keep old
Delegation/proposal/request records readable without generating them for the simplified
flow. No collection is physically deleted or bulk-migrated by this choice.

## Alternatives and consequences

Separate public workflows for each subordinate record duplicate identity coordination.
Silent mutable publication loses accountability; mandatory bulk conversion adds risk
before a demonstrated need. One workspace and lazy normalization preserve compatibility,
while all mutations must use the common module rather than independent legacy writers.
Server, local clients and interface cut over together and remove superseded advertised
names rather than retaining permanent aliases. A hidden temporary alias needs proof
that controlled components cannot update together. Emergency readOnly contains writes.

## Scope and amendments

Extracted on 2026-10-04 from [0024](0024-single-owner-editorial-authority-and-mutable-article-editions.md)
without a new product decision. Media coordination follows
[0013](0013-review-the-exact-submission-before-publication.md); shared catalog follows
[0023](0023-editorial-cli-over-http.md). Classification, public notices, operation intent
and accepted-but-deferred capabilities belong to the editorial contract.
