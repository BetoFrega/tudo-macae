# Editorial image delivery

Use for operating Article Lead Image delivery. [Media lifecycle](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835)
owns eligibility and shared uses; [release control](feature-flags.md) owns flag retirement.
Delivery and removal of the completed canary control belong to
[#1292](https://github.com/BetoFrega/macae-classificados/issues/1292).

## Configuration and publication order

The web Worker's production environment in [`wrangler.web.jsonc`](../../wrangler.web.jsonc)
owns application and rendering configuration; the production [image Worker manifest](../../apps/public-images/wrangler.jsonc)
owns the canonical origin and service binding. Read deployed configuration and version
back from providers before claiming delivery.

The application serves the granted public origin only when
`EDITORIAL_IMAGE_ORIGIN_ENABLED=1`; otherwise it answers 404. It never checks an
Editor session or offers a preview branch. Rendering uses
`NEXT_PUBLIC_EDITORIAL_IMAGE_TRANSFORM_ORIGIN` at build time. The Worker transforms
eligible lead images for every visitor, including requests without cookies, with no
PostHog dependency. Transformation failure delivers the authorized original.
Open Graph and structured-data destinations remain independent of Worker delivery.
The authentication qualification overlay leaves both editorial settings empty so
its isolated database cannot render production image URLs.

Publish the image Worker before an application build first introduces transformed
lead URLs. The [production workflow](production-delivery.md) does not publish this
Worker. Under release authority, run `pnpm --filter public-images-worker run deploy`,
read back the active version, canonical origin, service binding and scoped probe binding,
and qualify unsigned/signed probes. Archive the completed PostHog flag only after
verifying the deployed Worker no longer evaluates it.

Isolated qualification uses a fixed HTTPS fixture origin and its own image Worker.
Production configuration changes require the corresponding release authority.

## Origin transport

Production binds `EDITORIAL_ORIGIN_SERVICE` to the `www` origin Worker. Authorization
HEAD and original fallback use that binding: global fetch cannot invoke another
same-zone Worker Route. Transformations keep global `fetch(..., { cf: { image } })`;
passing them through the service binding would lose the image transformation path.
The configured HTTPS origin must match the host handled by the bound Worker.
An isolated environment binds its own fixture origin instead.

Before qualification, read Images → Transformations → Sources and verify the exact
source host and path are permitted. Restrict an editorial entry to its origin API
path, preserve existing sources and remove disposable entries after testing. A public
browser response alone does not prove either Worker transport or transformation.

## Revocation and manual cleanup

Withdrawal removes the Article's publication grants and records retired Media/digest
keys in `news_articles/{articleId}.pendingMediaPurges` in the same transaction.
Replacing published Media also retires prior keys and replaces that Article's grants.
An off-air edition creates no public grants; validated republication restores the
current receipt's grants. Media files and other Articles' grants remain intact.

After the mutation, cleanup checks the same effective public-use policy as the image
origin. Another valid published use preserves the shared URL. Otherwise the existing
purger removes both its Worker tag and exact origin URL, including cache generation.
The verified-purge adapter then requires origin denial and absence of every allowed
width/format variant in two separated observations. A reappearing entry causes another
purge round; an unsupported probe, timeout or exhausted recovery remains unconfirmed.
Limits are defined in `packages/public-image-delivery/verifiedPurge.ts` and
`packages/public-image-delivery/editorialPurgeVerification.ts`. Complete probes use HEAD with
`x-editorial-cache-probe: all`; the Worker inspects every allowed width/format locally,
with at most five concurrent Cache API matches. They return no bytes and neither
read the origin nor fill the cache. A response must echo the complete marker; an
older single-variant marker or arbitrary 404 is not evidence. The `1` marker remains
available for individual variant diagnostics. A resident variant is reported only as
an allowed width/format; cache failures return 502 without an absence marker.
Probe requests use generated identifiers; the public Worker generates its own rather
than trusting caller headers. A final failure links its generated response identifier,
observed boundary, status class and variant to the cleanup correlation in the existing
failure event. Arbitrary headers and response bodies never enter that diagnostic.
Each observation allows five seconds per retired key, capped at thirty seconds for
the batch, with at most five concurrent requests and two seconds per request.
Qualify mutation latency with one and twenty retired keys before activation: a clean
single-key confirmation performs four remote HEADs and waits one second; twenty keys
perform eighty remote HEADs. Origin denial and complete Worker inspection are evaluated
for at most five keys concurrently. Each clean observation still inspects 45 cache
entries per key inside the Worker. Up to three rounds can increase that work and latency. Detailed Worker logs retain the existing 10%
sampling. Record observed volume and cost before enabling this diagnostic workload.
Publish the probe-capable Worker before the application. Verify with
`pnpm run test:worker` and the focused verifier/orchestrator unit tests.
Production uses the existing `PUBLIC_IMAGE_PURGE_*` configuration and the canonical
`https://www.tudomacae.com.br` origin. Distribution starts independently of cleanup.

Failure preserves the mutation and pending keys. The Article workspace warns that
images may remain accessible and offers **Repetir limpeza das imagens**. Use that
Editor-authorized action; it rechecks public use, repeats the directed purge and
clears intent only if the Article version is unchanged. A completed repeat has no
additional purge effect. There is no background queue or global purge.

Failures reuse `event=public-image-purge`, `outcome=failed`, with `imageClass=editorial`,
`operation=editorial_media_cleanup`, bounded stage/cause, correlation and an Article
pointer for locating the pending intent. Follow the existing
[purge alert selector](public-image-canary.md#image-revocation) and use the
Newsroom action for this image class. Editorial republication must remain possible;
the advertiser permanent revocation-receipt procedure does not apply.

Verify the canonical mutation and recovery adapter through the public module:
`pnpm run test:integration src/packages/editorial/tests/publicMediaContent.integration.test.ts`.
This checks grant removal/restoration, shared use, replacement and failed-purge recovery
under the integration tier in [Test Harness Operation](test-harness-operation.md).

## Qualification before delivery

1. Publish two disposable Articles sharing one sanitized Media. Without an analytics
   cookie, warm AVIF, WebP and JPEG for the same Media/digest URL; verify miss followed
   by hit, no remote flag requests, no origin reads on a warm hit and the same purge
   tag across variants. Cloudflare strips `Cache-Tag` on delivery; prove coverage
   through the Cache API before and after directed tag purge. Record actual MIME
   types and transformation warnings: requested AVIF can fall back to WebP or JPEG
   under [encoding limits](https://developers.cloudflare.com/images/optimization/features/#format--f).
   Such a fallback does not qualify AVIF bytes. Cover home, news index, Article,
   raw HTML Open Graph and structured data; `leadMediaId: null` omits the lead image.
2. Withdraw the first Article and confirm the shared URL still works. Withdraw the
   last public use, deny the origin and purge both targets from `createPublicImagePurger`:
   Worker tag and exact editorial origin URL with `cache_generation`. Verify fresh
   requests no longer return bytes. An API acknowledgement alone is insufficient.
3. Exercise anonymous and cookie-bearing requests, transform failure, preview,
   staged Media, future publication, invalid grants/receipts and mismatched digest.
   Origin authorization failures remain denials. Verify retirement purge for a
   previously public warm entry; no hit-time origin read supplies that guarantee.
   Clean only the disposable fixtures.

The origin validates grants, current completed receipts, publication time, active
Media and sanitized bytes. Its HEAD follows the same checks as GET, including the
Storage read and digest validation. Measure miss latency in qualification; unit
assertions do not establish production performance. Qualification of natural editorial
retirement follows the [approved release observation](https://github.com/BetoFrega/macae-classificados/issues/1292#issuecomment-6040322030);
do not mutate real Articles solely to produce that evidence.

An isolated, transient 502 does not establish a product bug; infrastructure may be
the cause. Retest and record recovery before classifying the occurrence. Classify a
product defect only when reproduction or diagnostics support faulty product behavior.
Keep revision, variant, cache result and request ID in the
[work record](issue-tracker.md#diagnostic-records); a cache hit does not exercise
miss-time origin checks.

## Cache and rollback

The shared Worker Cache API stores only transformed variants, keyed by version,
width and negotiated format. Each editorial response to a visitor is `private,
no-store` with `Vary: Accept`; the long TTL is internal to the Worker cache.
Editorial hits serve the existing variant without consulting the origin. Cache misses
check origin authorization, including after a successful transformation.
Originals and denials are never stored as positive transformed entries.
The consistency boundary and observation limits follow
[ADR 0042](../adr/0042-verify-editorial-cache-purge-on-retirement.md). Qualification
must include a fill arriving between absent observations and retained pending intent
when verification cannot confirm cleanup. Inspect logs for `cause=verification`.

Rollback restores a qualified Worker revision through the
[production delivery procedure](production-delivery.md). Disabling an archived or
unused PostHog flag cannot roll back this Worker. If restoring a version that still
reads `editorial-image-canary`, restore its public project-token configuration and
verify the intended provider targeting before exposure. Preserve the scoped probe
binding and confirm signed/unsigned probes for the restored version.

### Complete inspection capability

The `all` probe requires a timestamped HMAC bound to the HEAD URL and mode, with
60 seconds of clock tolerance. Invalid, expired or missing authorization receives
403 before any Cache API read; a missing Worker secret fails closed. The server
signs with a domain-separated key derived from its existing purge credential.
The image Worker receives only that scoped key, not the Cloudflare API token.
The public single-variant `1` protocol remains compatible.

Before deploying the application, after production operation authorization,
transfer the scoped capability without exposing either value:

```bash
node bin/transfer-editorial-cache-probe-secret.mjs --production
```

This reads the numbered `public-image-cache-purge-token` version pinned in the
script directly into process memory, derives the key, writes
`EDITORIAL_CACHE_PROBE_SECRET` through Wrangler stdin, clears buffers, and verifies
the binding name only. No additional IAM grant or secret value in logs/files is
required. The script pins a numbered version, never `latest`; the purge token the
API Worker holds and the capability transfer must use the same numbered version. For an
explicitly authorized purge-token rotation, retain the previous API Worker and image
Worker versions as the recovery pair, update the script to the new numbered
version, then coordinate the API Worker secret and capability transfer.
The single-capability window can leave verification unconfirmed; preserve and
retry durable cleanup intents after both sides agree. Recovery must restore both
sides to the same numbered version. Do not claim seamless rotation. Read back the deployed Worker
version and qualify signed/unsigned probes before exposure. Use
`pnpm run typecheck` and the unit/runtime probe tests to verify the protocol.
