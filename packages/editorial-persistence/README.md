# Editorial persistence

Provider-free contracts for the Blog and shared Media read/write set in the
editorial D1 database. Construct the D1 adapter through
[the API Worker composition](../../apps/api-worker/editorial.ts); only its
[db implementation](../../apps/api-worker/lib/db/editorial.ts) knows D1. The
[migrations](../../apps/api-worker/migrations-editorial/) own the schema.

The [production composition](../../apps/api-worker/production.ts) serves Blog and Media
from this adapter only when the deployment binds `EDITORIAL_DB` through `EDITORIAL_D1_ID`;
otherwise every Media route answers 404
(`rg -n 'EDITORIAL_DB|EDITORIAL_D1_ID' apps/api-worker/production.ts apps/api-worker/deploy.mjs`).
This D1 is the only source of Blog and Media since the 2026-10-16
[cutover](../../docs/agents/editorial-cutover.md).

## Records

[index.ts](index.ts) defines the DTOs and operations; [records.ts](records.ts)
validates storage shape, epoch milliseconds, scope and size. Product factories own
product rules. Bodies keep their legacy fields.

| Kind | Source | Identity and scope |
| --- | --- | --- |
| `article` | `news_articles` | Article ID. `mediaIds` feeds the article/Media lookup. |
| `publicationReceipt` | `news_publication_receipts` | Receipt ID; `body.articleId`. |
| `media`, `mediaDigest`, `uploadReservation` | `media`, `media_digests`, `media_upload_reservations` | Original ID; a claimed digest points to `body.mediaId`, and `body.object` journals its sanitized Hosted object. |
| `mediaRevision` | `media/{id}/revisions` | Revision number; `namespace` is the Media ID. |
| `publicationGrant` | `media_publication_grants` | Original ID; `body.articleId` and `body.mediaId`. |
| `ingestionIntent`, `idempotency`, `activity` | `editorial_media_ingestion_intents`, `editorial_idempotencies`, `editorial_activities` | Original ID. |
| `legacy` | Retired Redação collections still read for attribution or permissions | Original ID; `namespace` is the source collection name. |

## Transactions and queries

Within `transact`, read every record before replacing or removing it. A decision may
repeat after a verified concurrent write, so fix time, generated IDs and validated
intent before entering it; external effects run after commit through durable
intents. Point epochs outlive deletion, so absence and create/delete/recreate are
guarded. Pages guard the narrowest scope that covers their filter: the article for
`articleId`, the Media for `mediaId` or revisions, otherwise the kind.

`RecordQuery` documents each filter's kind and order. Limits live in
`persistenceLimits`: 25 items or about 1 MB per page; per attempt 128 reads, 96
guards and 64 written records; 192 statements per batch; 4 attempts. One Blog save
touches its article, receipt, up to 20 Media and the grants it replaces.

Verify with `pnpm exec vitest run --config vitest.worker.config.mts apps/api-worker/tests/editorial.runtime.test.ts`
and `pnpm exec vitest run --config vitest.unit.config.mts packages/editorial-persistence/tests`.
