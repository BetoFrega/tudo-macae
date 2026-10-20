---
record: adr
id: "0030"
status: accepted
decided: 2026-09-19
---

# 30. Project the public catalog from compatible legacy profile storage

## Context and requirements

[Advertiser identities](https://app.notion.com/p/3ff84301eab3819283bcd1295e219c59) owns types and discovery.
The catalog must not force an atomic rename of administration, publication, machine
contracts and persistence that already use AdvertiserProfile.

## Decision

Expose the public catalog through its Business package interface projected from the
existing profile record, within Classifieds. Do not create a second entity/collection.
Keep legacy storage/administrative contracts until a complete touched capability can
migrate coherently. Adopt public vocabulary in touched public files, not repository-wide
search-and-replace. Existing `/anunciante/[id]` redirects permanently to canonical ID/slug.

Catalog cursors carry persisted ordering keys through data migration, so a partially
migrated collection cannot skip/repeat records. Promotion prerequisites are in
[Production delivery](../agents/production-delivery.md); new public reads use the
package interface and exclude private administrative metadata.

## Alternatives and consequences

One compatibility projection avoids dual public entities and unrelated migration risk.
Business and AdvertiserProfile coexist intentionally. Removing a boundary requires a
complete administration/publication/persistence capability, not a mechanical rename.
The machine administration guarantees in [0028](0028-machine-administration-of-claimable-advertiser-profiles.md)
remain; vocabulary does not override authorization, revision, replay or lifecycle.

## Scope and amendments

On 2026-09-29 the product assumption that every public identity is a Business was
superseded by 0034. The compatible projection choice remains; both public types and
classification now follow the identity contract.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0030-business-is-the-public-catalog-entity.md) preserves earlier dated wording and superseded clauses.
