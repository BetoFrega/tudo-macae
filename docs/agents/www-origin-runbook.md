---
trigger: when_operating_the_www_edge_worker
---

# `www` edge Worker runbook

`www.tudomacae.com.br` is served by the web application Worker
`tudo-macae-terms-workers` (the vinext build of the root app) through the router
Worker `tudo-macae-www-origin-production` (`apps/www-origin`, package
`packages/www-origin-routing`), attached to the zone routes
`www.tudomacae.com.br/*` and `mcp.tudomacae.com.br/*`. Provider state stays
manual: nothing here claims that a route, service or secret exists until it is
read back.

## What the router does

- Every `www` request not answered from the router's colo cache (see
  [Cache ownership](production-topology.md#cache-ownership)) reaches the web
  application through the `WEB_WORKER` service binding with method, body, path,
  query and cookies unchanged, and the Cloudflare ray as `x-www-request-id` and
  `x-correlation-id` (an edge-generated UUID when the ray is absent).
  Client-supplied root IDs are overwritten.
  [Authentication Diagnostics](authentication-diagnostics.md) defines downstream
  correlation propagation.
- The application's status and `Cache-Control` pass through (ADR 0017). Public
  files come from its asset layer without the `x-terms-worker-version` stamp.
  Versioned assets under `/_terms-workers/<sha>/` answer `502` instead of the
  application's `404` when the release no longer holds them.
- A binding failure answers `502` and is never retried; a write it may have run
  is logged with `uncertainWrite`. There is no second origin.
- Responses carry `x-www-origin: terms-workers`.
- `mcp.tudomacae.com.br` answers `404` with `no-store` and `x-www-origin: edge`
  for every path; its resources are retired
  ([MCP runbook](mcp-edge-runbook.md)). Other hosts answer `404`.
- Nothing renders per visitor at the edge; the router's only state is that colo
  cache.

## Deploy and recovery

The protected [production delivery](production-delivery.md) publishes the router from
the tested `main` SHA after the web application, and reads its active version and
zone routes back. Keep the proxied placeholder DNS and both routes attached; the
placeholders have no application behind them, so detaching a route is not
recovery. After delivery, confirm `env.WWW_ORIGIN_SIGNALS` and the `WEB_WORKER`
binding in
`wrangler versions view <version-id> --config apps/www-origin/wrangler.jsonc --env production`.

For a router regression, roll back only to a version without the
`CLOUD_RUN_ORIGIN` variable (check with `wrangler versions view`):
`wrangler rollback <version-id> --config apps/www-origin/wrangler.jsonc --env production`
keeps the routes. Older versions read journey flags and forward the MCP host to
the Cloud Run service `tudo-macae-www` with its proof, so they would restore the
retired machine surface; when no newer version exists, recover by delivering a
fixed `main`. Web application
recovery belongs to the [web Workers runbook](web-workers-runbook.md).

## Observability

The router logs `www_origin_routed` with `service`, `environment`, `release`
(router version), `outcome`, `requestClass`, `statusClass`, `selectedOrigin`,
the application's `termsWorkerVersion` when stamped, and `requestId` (the
Cloudflare ray, also sent to the application as `x-www-request-id`). `failure:
terms-worker-unavailable` marks an application `5xx` or a binding failure;
`uncertainWrite` marks a non-read whose binding call failed and may have run. It
never logs identity, path or query. `edgeCache` marks reads of
[`edgeCachedPaths`](../../packages/www-origin-routing/lib/edgeCache.ts): `hit` served
from the colo cache, `read-failed` or `write-failed` when that cache failed and
the read went on to the application; these keep `outcome: success` and stay out of the
unsampled failure counter. `requestClass: editorial` marks the retired machine host.
Detailed logs follow the `0.1` head
sampling of the public-image Worker, which also samples failures. Invocation logs
are disabled because they record raw request URLs, including typed searches.

Failures are counted without head sampling in the Workers Analytics Engine
dataset `www_origin_signals` (binding `WWW_ORIGIN_SIGNALS`,
`apps/www-origin/adapters/analytics.ts`). A request writes one data point
only when its outcome is `failure`; healthy requests write nothing. Positions are the query contract:

| Column | Value |
|---|---|
| `index1`, `blob1` | `failure` |
| `blob2` | `failure` |
| `blob3`, `blob4` | `requestClass`, `statusClass` |
| `blob5` | Router `release` |
| `blob6`, `blob7` | Empty; held by the retired Cloud Run revision and journey ID |
| `double1`, `double2` | `1`, `1` for an uncertain write |

Read it through the SQL API (`POST /accounts/{account_id}/analytics_engine/sql`,
token with Account Analytics Read):

```sql
SELECT blob2 AS failure, blob3 AS request_class, blob4 AS status_class,
  blob5 AS release,
  SUM(_sample_interval * double1) AS events,
  SUM(_sample_interval * double2) AS uncertain_writes
FROM www_origin_signals
WHERE timestamp > NOW() - INTERVAL '15' MINUTE
GROUP BY failure, request_class, status_class, release
```

The dataset exists after the first write, so an empty result cannot tell a
healthy Worker from one deployed without the binding; the write swallows that
error, so confirm the binding after each deploy as above.
Cost, recorded 2026-09-26 against the zone's 30-day volume of about 128 thousand
requests (Cloudflare GraphQL `httpRequests1dGroups`): writes follow incidents,
so even a full outage at 50× that volume stays under the 10 million data points
per month included in Workers Paid (then US$ 0.25 per million; reads: 1 million
queries included; Workers Free: 100 thousand writes per day), and Cloudflare
does not bill Analytics Engine yet
(<https://developers.cloudflare.com/analytics/analytics-engine/pricing/>).
Retention is three months and not configurable
(<https://developers.cloudflare.com/analytics/analytics-engine/limits/>); the
dataset is an aggregate metric with bounded dimensions only, not an operational
log, so the 30-day log limit in `OBSERVABILITY.md` does not apply. Alternative rejected for growth: `head_sampling_rate: 1`,
which logs every healthy request. Review when a month exceeds 1 million data
points, which means sustained failure, not traffic.


## Retired ad sitemap resources

No workflow or code in this tree uses the service account
`ad-sitemap-maintainer@macaetem-dev.iam.gserviceaccount.com`, the GitHub variables
`CLOUD_RUN_SITEMAP_ACCOUNT` and `AD_SITEMAP_SCHEDULE_APPROVED`, or the Firestore
collections `ad_sitemap_generations` and `ad_sitemap_control`
(`rg -n 'ad_sitemap_|SITEMAP_ACCOUNT|SCHEDULE_APPROVED' .github src bin packages apps`
prints nothing). Deleting them is a production
operation that needs its own authorization after the revision serving the
on-request [Anúncios sitemap](production-crawling.md#anúncios-sitemap) carries
all traffic. Only revisions below the `www` rollback floor in
[Recovery](classifieds-cutover.md#recovery) read those collections, so the floor
already permits deleting them.
