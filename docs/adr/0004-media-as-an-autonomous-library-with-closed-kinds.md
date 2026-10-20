---
record: adr
id: "0004"
status: partially-superseded
decided: 2026-08-15
---

# 4. Media as an autonomous library with closed kinds

## Context and requirements

Embedded `AdImage[]` records couple images, metadata and deletion to one Ad. Shared
editorial use would duplicate credit and license corrections across unrelated
Articles. [Media lifecycle](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835) owns the rights, public
effects and authority; [Media concepts](../contexts/media/CONTEXT.md) own the names.

## Decision

Keep Media in an autonomous package and reference its canonical identity from
consumers. Use a closed discriminated TypeScript union with a Zod schema per kind.
Runtime-administered field sets were rejected: they require a dynamic renderer,
validation and weak generic types for infrequent schema changes. Kind-specific
schemas preserve required fields without one mostly optional record.

References resolve current canonical metadata rather than pinning a metadata revision.
Before correction, append an immutable MediaRevision and record the operation. The
visual file is immutable; replacement has another identity. Shared references cannot
use the deletion cascade of an exclusively owned Ad image.

Migrate Ad image metadata only after the editorial model proves useful; leave bytes,
public URLs and Storage prefixes in place. The planned integration is tracked by
[#1071](https://github.com/BetoFrega/macae-classificados/issues/1071).

## Alternatives and consequences

One embedded record per consumer makes correction fan out. An autonomous record
corrects metadata once and keeps history, at the cost of two image models during
migration and possible unreferenced objects. Reference-safe physical cleanup is a
separate decision. A new kind requires deployment; reconsider closed kinds if they
start changing weekly. A browsable archive is not implied by the initial picker.

## Scope and amendments

On 2026-10-10, [ADR 0043](0043-use-cloudflare-hosted-images-across-surfaces.md)
superseded only the requirement to leave image bytes in Storage. The autonomous
model, metadata rules and separate Ad integration remain; public URLs and legacy
prefixes are preserved through compatibility resolution during the storage move.

On 2026-08-15 the representation name changed from `procedencia` to `provenance`.
On 2026-08-27 canonical metadata and immutable revision history were confirmed.
The authority refinement of 2026-09-11 is in the Media contract. Naming follows
[Context Map](../../CONTEXT-MAP.md), not a local naming convention.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0004-media-as-an-autonomous-library-with-closed-kinds.md) preserves earlier dated wording and superseded clauses.
