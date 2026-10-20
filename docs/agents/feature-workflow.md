---
trigger: when_adding_features
---

# Feature Development Workflow

## Direction

New domain behaviour belongs in deep modules under `src/packages/`. The package
interface should hide substantially more implementation than it exposes. Follow
`src/packages/README.md` for the canonical package layout and import rules.

`src/features/` is legacy structure, not the destination for new domain
modules. Migrate it incrementally when product work changes it:

- move the smallest coherent domain capability affected by the change;
- replace the old module instead of wrapping or duplicating it;
- leave unrelated legacy modules alone;
- keep routes, server actions and UI in their framework-facing locations, as
  callers of package interfaces.

The migration unit is a coherent capability, not an arbitrary file. Moving a
database function while leaving its rule and validation spread across the old
feature does not deepen the module.

## Adding or Changing a Feature

1. Identify the domain capability and the behaviour the change must preserve.
2. Choose its owning module: deepen an existing package, create a package for a
   new capability, or migrate the affected capability from a legacy feature.
3. Design the smallest package interface that gives callers the required
   leverage. Keep use cases, validation and persistence details private. Apply
   [Domain Infrastructure Seams](domain-infrastructure-seams.md) to new behaviour
   and the affected existing capability.
4. Make server actions validate and authorize, then call a package entry point.
5. Build or update the routes and UI that consume that interface.
6. Replace the legacy implementation and redundant tests after equivalent
   behavioural coverage exists through the new interface.
7. Complete test coverage and incremental migration of affected tests with
   [Test Selection](test-selection.md).

The change is not complete if new domain logic was added to a legacy feature
without either migrating the affected capability or recording why that
migration cannot safely fit the change in the PR description.

## Ownership Verification

Actions verify authority through the owning domain's public operation. Associated
Ads and pending publications derive authority from the current Advertiser Identity;
unassociated pending work remains private to its initiating account. Follow
[Advertiser identities](https://app.notion.com/p/3ff84301eab3819283bcd1295e219c59) and
[ADR 0034](../adr/0034-ads-belong-to-advertiser-identities.md); an Ad's historical
`userId` does not grant authority over associated content.

Deletions cascade **for ads under a profile**: deleting a profile deletes its ads, because an ad belongs to exactly one profile and to nothing else.

Do not generalise that. Media does **not** cascade: a single file is referenced by many ads and matérias, so deleting a referencing document must leave the file and its credit alone. See `docs/adr/0004-media-as-an-autonomous-library-with-closed-kinds.md`. Before writing a cascading delete, ask whether the thing being deleted is the only owner.

## Admin Routes

Protected by layout-level checks in `src/app/admin/layout.tsx` using `unauthorized()` and `forbidden()`.
