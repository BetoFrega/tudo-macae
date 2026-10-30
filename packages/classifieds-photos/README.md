# Classifieds photos

Pure lifecycle for files owned by Ads and Advertiser Profiles. The implementation
scope is [#1716](https://github.com/BetoFrega/macae-classificados/issues/1716).
[Public-image delivery](https://github.com/BetoFrega/macae-classificados/issues/1288)
keeps its URLs, variants and revocation contract. Storage remains the production
authority until the joint cut in
[#1719](https://github.com/BetoFrega/macae-classificados/issues/1719).

## Approved migration destination

[ADR 0043](../../docs/adr/0043-use-cloudflare-hosted-images-across-surfaces.md)
selects Hosted Images instead of R2 with Image Transformations for image storage,
variants and delivery. The [cross-surface plan](https://github.com/BetoFrega/macae-classificados/issues/1862)
owns coverage; [#1719](https://github.com/BetoFrega/macae-classificados/issues/1719)
owns adaptation and activation gates. R2 semantics and transfer commands below
qualify the earlier preparation, not the selected migration destination. Domain
rules retain provider-independent stores and objects. This record does not activate
the migration.

## Consumption

`createPhotoLifecycle` takes domain stores, objects, image decoding, purge
verification, time, operation IDs and digest calculation. `apps/api-worker/classifiedsPhotos.ts`
composes D1/R2 adapters; `@tudomacae/classifieds-client/photos` supplies the HTTP
client. The default API Worker has no photo composition. Qualification requires
both the injected factory and the existing Classificados qualification gate.

- `upload` reserves metadata before bytes, then confirms the generation and owner
  reference in one D1 transaction. Preserve operation ID, expected revision and
  bytes when retrying. New bytes require a new operation ID. The server action for
  Ads retains its existing image sanitization before invoking the client.
  Direct uploads also require an Images binding: metadata and a consumed WebP
  transformation reject undecodable bytes before reservation. Source bytes remain
  immutable. Ads and Profiles share the 16 megapixel limit. Aggregate
  animation decoding follows the [Images service limits](https://developers.cloudflare.com/images/get-started/limits/).
  Local Images tests use Miniflare's offline implementation; remote decoder and
  animation qualification remain part of the joint cut. Decoding incurs an Images
  transformation invocation before ownership and idempotency checks, including
  rejected attempts and identical retries. Provider billing deduplicates identical
  transformations monthly, but requests/processing still repeat; their production
  magnitude is unmeasured. Admission budgets must protect this effect too.
  All four supported extension keys are checked transactionally, so changing MIME
  cannot reuse an operation ID even after retirement.
  Ad reservation, finalization and user removal require the current publication
  state to be `pending`; publication starting during the byte write prevents
  confirmation. Deletion cleanup uses its durable intent after unlinking.
  Removing or replacing Ad images preserves contiguous display order. Profile
  replacement retires only photos managed by that Profile; unmanaged or shared
  references retain their owners.
- `publication` verifies at most three current R2 generations, rechecks metadata,
  and returns the confirmed images and Ad revision. The publishing adapter
  must compare this revision inside its write transaction; photo removal and
  reservation change that revision. Publication orchestration belongs to
  [#1717](https://github.com/BetoFrega/macae-classificados/issues/1717).
- `read`/`readAd` authorize against current owner metadata, verify the R2 generation,
  and recheck visibility before returning bytes. HEAD uses R2 metadata only.
  Pending Ads require the owner or administrator. Public Ad reads require publication.
  Qualified legacy routes retain the allowed `w` candidates, the 1920 px cap,
  no enlargement, WebP quality 75 and GIF passthrough. Their explicit
  `createClassifiedsPhotoRenderer` composition uses an Images binding; missing
  rendering fails closed. Production binding/configuration remains part of the
  joint cut. The raw origin route is reserved for the public-image Worker.
  Historical image IDs and valid legacy owner IDs remain readable. New keys hash
  owner IDs that do not fit the public-image path policy; transfer preserves raw
  historical paths after checking their owner and relative segments.
- `remove` acknowledges a durable retirement intent as `scheduled`. `sweep` claims
  at most 25 photo records and examines at most 25 existing deletion intents per
  invocation. Claims and retries survive restart; active reservations retain their
  lease. Missing confirmed bytes remain uncertain.

`createClassifiedsPhotoPurge` freezes the Worker cache tag and the Classifieds
Worker source URL in D1 before retirement; frozen sources are purged as recorded. It requires provider acceptance and explicit
visibility verification. Exact paths and URLs stay in private persistence, outside
telemetry. Editorial Media and shared references retain their existing owners.
Cleanup telemetry retains bounded purge cause and layer with the operation ID.

R2 retirement replaces bytes with a permanent conditional marker. Never delete
markers: R2 deletion has no generation precondition, so deleting one permits a late
writer to recreate that key. The cost is one retained object per retired photo;
production volume/cost remain unmeasured. Warm variants also pay D1 eligibility and
R2 HEAD requests; production traffic qualification belongs to the joint-cut ticket.
The current consistent-read adapter commits assertions even on read-only guards:
an Ad HEAD with a Profile entails 8 D1 batches, 20 statements and 12 rows written
across its two eligibility checks, before retries. This is an accepted unmeasured
cost of the existing transaction adapter. Before activation, measure `rows_written`,
latency and interference with mutations; a read-only SQL adapter must preserve
the visibility recheck if qualification requires it.

## Transfer seam

[transfer.ts](transfer.ts) imports one historical photo with its original path,
source generation and digest, bypassing upload normalization and account admission.
Production photos imported this way on 2026-10-12 keep that provenance; runtime
fixtures use the seam to recreate it.

## Verification

```sh
pnpm run test:worker apps/api-worker/tests/photos.runtime.test.ts
pnpm --filter @tudomacae/classifieds-photos run test
pnpm run lint:boundaries
```
