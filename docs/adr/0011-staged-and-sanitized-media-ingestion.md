---
record: adr
id: "0011"
status: accepted
decided: 2026-08-27
---

# 11. Two-step private and sanitized Media ingestion

## Context and requirements

[Media lifecycle](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835) owns rights and public effects.
Passing bytes through MCP or trusting client size/MIME creates inconsistent handling;
fetching arbitrary remote URLs would add an SSRF boundary.

## Decision

Prepare reserves one private quarantine object after authorization and issues a
short-lived signed upload constrained to that object and exact length or bounded
content-length range. MIME declaration alone is not a size control. The client sends
bytes directly; idempotent finalization independently validates reservation and object.

Decode actual format, enforce byte/pixel bounds, re-encode accepted output, strip
embedded metadata and compute sanitized SHA-256 before leaving quarantine. Claim the
digest uniquely and transactionally; metadata/provenance divergence is a conflict,
never overwrite. Exact deduplication is distinct from perceptual candidates.

Objects receive no permanent public ACL. Delivery validates active Media and a grant
for a published consumer or explicit isolated use; previews are authorized private
reads. [0013](0013-review-the-exact-submission-before-publication.md) coordinates
publication across Firestore and Storage. Media stores Source Permission as opaque
reference, validated by Editorial without a package cycle.

## Alternatives and consequences

Object storage carries bytes and MCP carries control. Shared server processing avoids
trusting each client. Signed upload requires narrow object/signing permissions and
first-party CORS. Expired unfinalized reservations have 24-hour quarantine cleanup;
this does not delete registered Media. Replay finalization returns the same Media or
exact duplicate result. Metadata/rights/authority rules are in the lifecycle contract.

## Scope and amendments

The former persistent-proposal and manual-only application requirements were
superseded on 2026-09-11. No new remote fetcher or automatic perceptual merge is implied.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0011-staged-and-sanitized-media-ingestion.md) preserves earlier dated wording and superseded clauses.
