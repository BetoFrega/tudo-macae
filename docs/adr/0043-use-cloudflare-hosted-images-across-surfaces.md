---
record: adr
id: "0043"
status: accepted
decided: 2026-10-10
---

# 43. Use Cloudflare Hosted Images across surfaces

## Context and requirements

Cloudflare already delivers public images, while Firebase Storage remains their
origin according to the [delivery migration receipts](https://github.com/BetoFrega/macae-classificados/issues/1288).
The separate backend preparation introduced an unactivated D1/R2 photo lifecycle.
The user reviewed Hosted Images against R2 with Image Transformations and approved
Hosted Images for every image surface on 2026-10-10. The
[storage migration plan](https://github.com/BetoFrega/macae-classificados/issues/1862)
records that approval, scope, exceptions and delivery sequence.

[Media lifecycle](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835) owns identity, rights and grants;
[Domain Infrastructure Seams](../agents/domain-infrastructure-seams.md) owns the
boundary between domain rules and provider adapters.

## Decision

Use Hosted Images as the destination for sanitized image originals, variants and
delivery across Ads, Advertiser Profiles, Blog Media, private previews, sharing and
social distribution. Preserve domain identities, metadata, references and operation
receipts independently of provider IDs. Shared Media retains one canonical identity
across consumers. Storage changes do not require the separate Ad-to-Media model
migration in [#1071](https://github.com/BetoFrega/macae-classificados/issues/1071).

Confine provider operations to adapters. Adapt the existing photo preparation and
transfer tools; do not activate a second canonical R2 image inventory. Preserve
legacy URLs through compatible resolution, rather than retaining Google as the
permanent origin. Inventory framework assets and unsupported formats explicitly;
this choice does not select a video service.

Provider existence or a signed URL does not establish a current public grant.
Keep application validation, admission, sanitization, private access and recoverable
revocation. Native deletion purges Images copies, but application/Worker aliases and
caches still need verification. Preserve the editorial cache-hit and retirement
contract of [ADR 0042](0042-verify-editorial-cache-purge-on-retirement.md); do not add
an origin read per editorial cache hit as an implementation shortcut.

Public Ad and Profile photos served from Hosted Images follow the same contract:
the image Worker serves warm hits without an origin read, and a cold read takes
its status (`200`, `404`, `410`) from its own variant GET. Retirement relies on the
verified purge, which observes origin denial plus the signed complete-cache probe
over every preset, width and format of the photo's class, twice; a late fill keeps
the cleanup pending. Deploy the probe-capable image Worker before the API Worker
that sends the probe. As in ADR 0042, this is eventual recovery, not a global fence:
probes inspect only the reached point of presence, and a fill completing after the
observation window stays cached until another purge. A per-request
origin guard is rejected: the Hosted origin needs several dependency reads, so the
guard costs a full origin round trip on every hit and outlives any bounded timeout.

## Alternatives and consequences

R2 with Image Transformations offers general object storage but leaves more of the
image inventory, variants and retirement pipeline with the application. Hosted
Images was selected for its integrated image storage/delivery pipeline and the
user's preference after review. It still requires domain-level recovery and
authorization; it does not replace the lifecycle.

[Hosted billing](https://developers.cloudflare.com/images/pricing/) counts stored
and delivered images, and some binding transformations have separate charges.
The [Hosted binding](https://developers.cloudflare.com/images/storage/binding/)
provides provider operations; [direct upload](https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/)
does not by itself enforce the product's smaller upload limit before provider cost.
Custom image IDs cannot be used for signed private images. Direct delivery from
Hosted Images through a custom domain (`/cdn-cgi/imagedelivery/...`) was rejected on
2026-10-12: public Hosted URLs would bypass the origin denial and verified purge
above, so unpublishing an Ad could no longer revoke its photos. Preserve the existing
transport until a compatible change is demonstrated or separately approved.
Reconsider the destination if observed cost or required privacy/format behavior
cannot satisfy the governing contracts.

## Scope and amendments

Partially supersedes [ADR 0004](0004-media-as-an-autonomous-library-with-closed-kinds.md)
only where it leaves image bytes in Storage. Its autonomous Media model and metadata
rules remain. It also supersedes the R2 image-file destination in
[ADR 0040](0040-migrate-backend-before-replacing-the-web-renderer.md), preserving
backend-first ordering and D1 authority. Legacy prefixes remain compatibility
identifiers rather than a requirement to retain the original provider. The private
and sanitized ingestion requirements of [ADR 0011](0011-staged-and-sanitized-media-ingestion.md) remain.

Acceptance records the destination choice, not implementation, transfer, deletion,
deployment or production exposure. The migration plan owns per-surface completeness,
operational gates and exceptions; provider documentation above was checked on
2026-10-10.
