---
record: adr
id: "0044"
status: accepted
decided: 2026-10-10
---

# 44. Store Classifieds authority in D1

## Context and requirements

The [Classifieds cutover](https://github.com/BetoFrega/macae-classificados/issues/1719) requires data and photo consumers to share an authority without restoring legacy writers when a release control fails. The development-only qualifier is not a production cutover mechanism. [Hosted Images](0043-use-cloudflare-hosted-images-across-surfaces.md) remains the photo destination.

## Decision

Store a singleton authority record in the existing D1 database. Its initial value selects the legacy authority. A one-way promotion selects the Worker authority; SQL rejects regression and deletion. Read the record from the primary before selecting an implementation. Missing or unavailable state closes operations.

A temporary environment-targeted boolean release control may open or suspend the Worker authority. It cannot promote the durable record or select legacy after promotion. Next and the public image Worker obtain the admitted authority from the API Worker without caching. Authentication and ownership remain separate checks.

## Alternatives and consequences

Beto approved D1 in the [decision record](https://github.com/BetoFrega/macae-classificados/issues/1719#issuecomment-6104700579). A Durable Object could store the authority but would add a resource and its operation without a demonstrated benefit. A flag alone would not retain the cutover when disabled or unavailable.

Every production selection depends on an API/D1 read, including public photo cache hits. A page with multiple photos adds one authority request per image request; production latency and fan-out remain unmeasured. The existing release-control reader retains its bounded cache and concurrent-request deduplication; the D1 authority itself is never cached. This favors consistency over availability: dependency failure closes even legacy selections because assuming legacy could restore stale writers. Coordinated deployment must install the migration and authority endpoint before consumer adoption. The durable record is not a fence against requests already executing or older deployments that bypass this selection; freezing and disabling those writers remains a separate activation gate.

## Scope and amendments

Acceptance authorizes preparation only. Deploy, live release configuration, promotion, image transfer and production activation require the concrete operational plan. Provider and cache qualification and remaining consumer coverage stay in the cutover ticket.

2026-10-11: the authority record lives in the Classifieds database, not the existing Authentication one ([0045](0045-separate-api-worker-databases.md)).

2026-10-12: after promotion the release control left the selection path; the durable record alone selects the authority, and no remote switch closes it ([#2009](https://github.com/BetoFrega/macae-classificados/pull/2009)). Decision and Consequences text about the release control describes the pre-promotion window.

2026-10-12: the public image Worker no longer reads the authority; in production it always selects the Worker origin, so photo cache hits make no API/D1 read ([#2025](https://github.com/BetoFrega/macae-classificados/issues/2025)). Next still reads it from the API Worker.

2026-10-13: rollback below API Worker version `a8cd6aac` is no longer accepted, so the release control may be archived; the floors live in [Recovery](../agents/classifieds-cutover.md#recovery).
