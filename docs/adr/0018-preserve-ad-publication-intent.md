---
record: adr
id: "0018"
status: accepted
decided: 2026-09-06
---

# 18. Keep publication completion independent of visibility in the same Ad record

## Context and requirements

[Ad publication journey](https://app.notion.com/p/3f684301eab381d0bf85e7b9f92c1b17) owns explicit publication
and recovery. A paused Ad may be unfinished or deliberately paused after publication;
deriving completion from paused status loses that distinction.

## Decision

The refinement of 2026-09-07 keeps publication state on the same ads document, independently
of visibility: pending private work, publishing durable write awaiting listing invalidation,
and published completed publication. Legacy records without the field are not pending.
No transfer between collections is needed to finish publication.

An unfinished record can be associated only with the starting authenticated account
until a profile is chosen; publication keeps its profile-required invariant. Persistence
of profile data and publication of the chosen Ad remain separate domain operations.
[0034](0034-ads-belong-to-advertiser-identities.md) defines authority after association.

## Alternatives and consequences

Reusing paused state misclassifies intentional pauses. A separate collection adds a
transfer and another failure boundary; the independent state preserves one identity
through replay/recovery. Reads do not create empty profiles to manufacture association.
Interaction and publication requirements remain in the journey and owning glossary.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0018-preserve-ad-publication-intent.md) preserves earlier dated wording and superseded clauses.
