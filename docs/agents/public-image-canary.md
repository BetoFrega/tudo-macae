# Public image delivery

The canonical edge contract is
[`config/public-image-canary.json`](../../config/public-image-canary.json). It
closes the route and presets for public Anúncio and Perfil de anunciante photos;
editorial images follow [Editorial images](editorial-image-canary.md), and every
private object remains outside this route.

Public image delivery retains Next.js's default responsive grid. Its closed
presets are the exact candidates emitted for the selected avatar, card, gallery and
thumbnail components; changing global `deviceSizes` or `imageSizes` would also alter
other image consumers. Component and manifest tests fail if that shared default drifts.

## Control boundary

Repository delivery does not activate production; deploying the production Wrangler
environment and verifying the live probe is a separate, explicit operation.

Anúncio and Perfil de anunciante requests, including the historical
`/v1/remaining/profile/...` alias, read the negotiated variant from the Classifieds
Worker at `CLASSIFIEDS_ORIGIN` + `/api/classifieds/photos/public/<key>?w=<width>&format=<format>`.
`apps/public-images/deploy.mjs` sets `CLASSIFIEDS_ORIGIN` from
`AUTHENTICATION_API_ORIGIN`. Hosted Images produces the variant, so the Worker
transforms nothing for these classes and has no original fallback. Without
`CLASSIFIEDS_ORIGIN` the Worker answers `503` and logs
`cause=classifieds_origin_missing` in every environment; an origin that is not a
bare HTTPS origin answers `502` with `failure=configuration`. Variants stay in the
Worker cache for one year and warm hits read no origin. A cold read passes the
origin's `404` or `410` through with `Cache-Control: no-store`; any other failure
answers `502/rejected` with `failure=origin`.

For rollback, follow the manifest's `rollback` entries.

The adoption release removes the `public-image-canary` PostHog dependency. Archive
that temporary flag after reading back the deployed Worker version and verifying
public delivery. The manifest's filename remains stable for existing consumers.
Issue [#1150](https://github.com/BetoFrega/macae-classificados/issues/1150)
owns the adoption release and its production evidence.

## Verification

Run the hermetic Worker contract and runtime checks:

```bash
pnpm run test:worker
pnpm run typecheck:worker
```

After an authorized edge operation, use a current public Anúncio object key to verify
the closed route, diagnostic headers and a warm repeat. The probe fails without this
sample; a denial-only run is not evidence that delivery works:

```bash
PUBLIC_IMAGE_CANARY_SAMPLE_KEY='ad-images/<ad-id>/<file>' pnpm run probe:image-canary
```

## Image revocation

The API Worker retires Anúncio and Perfil de anunciante photos
(`apps/api-worker/lib/classifiedsPhotoPurge.ts`). Before retirement it records in D1
the Worker `Cache-Tag` and the versioned Classifieds Worker source URL. The sweep
purges that tag, which clears every Cache API variant, and that URL, which clears
the resizing cache, then completes only after visibility verification. A failed
purge or verification keeps the retirement pending for the next sweep. The token
needs only zone `Cache Purge` permission and stays a server secret as
`PUBLIC_IMAGE_PURGE_TOKEN`; `PUBLIC_IMAGE_PURGE_ZONE_ID` identifies the
`tudomacae.com.br` zone. The Worker uses generation 2 for both the Cache API key
and the source URL query, so it never reads entries created without a tag. The
source URL query is part of Cloudflare's default cache key and needs no Enterprise
custom key. After purge, a cold read answers the origin's `410/gone`.

For `imageClass=editorial`, use the
[editorial cleanup procedure](editorial-image-canary.md#revocation-and-manual-cleanup)
and its Article workspace retry action. Its failures log
`event=public-image-purge` with `outcome=failed`. An operational alert
must notify the maintainer on one such failure in five minutes, with the Cloud
Logging selector below, an actively tested notification channel and this runbook:

```text
resource.type="cloud_run_revision"
jsonPayload.event="public-image-purge"
jsonPayload.outcome="failed"
```

The alert and log export require verification in the production provider; code
and a local log assertion alone do not establish delivery. Keep manual purge as
the response until that verification is complete.

To check public delivery and Worker Cache API removal with a disposable public ad image, set the same key
and an opaque `PUBLIC_IMAGE_REVOCATION_EXECUTION_ID` for both commands to pair
their evidence. The first command must pass for AVIF, WebP and JPEG. Remove
that image through the advertiser UI, then run the second command. It must show
that all three old URLs return Worker-owned `410/gone/miss` on two fresh requests.
Each public request has a five-second deadline; timeout fails the probe.
This public probe cannot inspect Cloudflare's resizing cache; verify the source
URL purge request and provider outcome separately before claiming both layers cleared. Repeat the two commands for a disposable profile
photo replacement and a whole-ad deletion before promoting phase 1.

```bash
PUBLIC_IMAGE_REVOCATION_EXECUTION_ID='<opaque-id>' PUBLIC_IMAGE_REVOCATION_SAMPLE_KEY='ad-images/<ad-id>/<file>' PUBLIC_IMAGE_REVOCATION_PHASE=warm pnpm run probe:image-revocation
PUBLIC_IMAGE_REVOCATION_EXECUTION_ID='<opaque-id>' PUBLIC_IMAGE_REVOCATION_SAMPLE_KEY='ad-images/<ad-id>/<file>' PUBLIC_IMAGE_REVOCATION_PHASE=verify pnpm run probe:image-revocation
```

For subsequent migration phases, record representative avatar, card and gallery
samples in their owning issue before routing an additional image class.
For each sample capture original and transformed bytes, cold and warm request latency,
and page LCP on the same device/network profile. A small or noisy sample is
inconclusive; it does not justify a percentage claim. The adoption decision in issue
[#1150](https://github.com/BetoFrega/macae-classificados/issues/1150) approves paid
capacity above the 5,000 monthly unique transformations allowance. Consumption is
not an adoption gate; verify billing in the provider before claiming that capacity
is enabled.
