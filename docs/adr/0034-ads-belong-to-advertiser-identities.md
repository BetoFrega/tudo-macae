---
record: adr
id: "0034"
status: accepted
decided: 2026-09-28
---

# 34. Derive Ad authority through its associated Advertiser Identity

## Context and requirements

[Advertiser identities](https://app.notion.com/p/3ff84301eab3819283bcd1295e219c59) owns the types, belonging
and classification policy. The inspection of 2026-09-30 found both advertiserProfileId
and userId on Ads/pending work. Rechecked after the workspace extraction on 2026-10-04:
`rg -n "userId|advertiserProfileId" src/integrations/ads/db/adDb.ts packages/ads/lib/publicationDrafts.ts packages/ads/adMutations.ts`.
Independent UID ownership would retain former-owner authority after Business transfer.

## Decision

Resolve authority through the associated identity rather than an independent Ad user
relation. Pending work follows that same identity after association; before association
it is private to the starting account. All private listings and mutation paths use the
same relationship. Replace the duplicated UID boundary coherently before enabling
administrative Business transfer.

## Alternatives and consequences

Transferring only the profile or moving Ads one at a time leaves inconsistent authority
on Ads and pending work. One authoritative relation makes transfer coherent, but needs
inventory/migration of every affected path and explicit legacy classification. Specs
[#1451](https://github.com/BetoFrega/macae-classificados/issues/1451) and
[#1452](https://github.com/BetoFrega/macae-classificados/issues/1452) own that work and its
gates; this architectural acceptance is not permission to migrate accounts or data.

## Scope and amendments

The 2026-09-29 extension of public capabilities/type policy is in the identity contract
and supersedes the corresponding assumption in 0030. Personal profiles are not inferred
from name/contact/Activity Areas; identity classification does not change this authority seam.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0034-ads-belong-to-advertiser-identities.md) preserves earlier dated wording and superseded clauses.
