---
trigger: when_reasoning_about_crawling_or_robots
---

# Production crawling and robots

This branch owns crawler policy and the precedence between Cloudflare and application
directives. Load the shared [production delivery contract](production-topology.md) only
when request-path or cache ownership is also relevant.

## Current contract

As measured on 2026-10-09, production serves the application's `robots.txt` route:

```text
GET https://www.tudomacae.com.br/robots.txt
→ 200 served-by=terms-workers cloudflare-policy=no cloudflare-managed=no crawler-directives=yes application-policy=yes
```

The route in [`src/app/robots.ts`](../../src/app/robots.ts) allows all user agents at `/`
and publishes the canonical news and classifieds sitemap URLs. The probe reports
`served-by=terms-workers` (the `www` edge Worker and the web application), the absence of a
Cloudflare default policy and managed-content block, and the presence of crawler
directives.

Re-measure the public result with the shared probe:

```bash
npm run probe:edge
```

The `robots.precedence` check records the status, responding layer, Cloudflare default
policy signature, managed-content marker and presence of crawler directives.
`application-policy=yes` verifies a `text/plain` response, the combined wildcard Allow
rule and exactly the two canonical sitemap URLs. Comments, whitespace, directive case,
sitemap order and redundant records do not change the measurement. Nonempty Disallow
records, a scoped crawler group or missing,
changed or additional sitemaps produce drift. Verify expected and divergent responses
through the exported measurement with `npm run test:unit -- bin/edgeProbeMeasurements.test.ts`. Confirm the
application response and its source separately when changing it:

```bash
sed -n '1,80p' src/app/robots.ts
```

## Anúncios sitemap

[`/sitemaps/anuncios.xml`](../../src/app/sitemaps/anuncios.xml/route.ts) is one
`<urlset>` rendered on request from `ads.sitemap`, read through the Classifieds
authority router (Firestore before promotion, the API Worker's D1 after). It lists
active, published, non-deleting Anúncios newest first, with `lastmod` from
`updatedAt`, else `createdAt`. With no such Anúncio it returns `404`.

| Concern | Rule |
|---|---|
| Freshness | `Cache-Control: public, max-age=3600`. The `www` edge Worker keeps that response in each colo's cache for its `max-age` ([`edgeCachedPaths`](../../packages/www-origin-routing/lib/edgeCache.ts)), so a removed Anúncio can stay listed for up to an hour; the origin also reuses one read per instance for about a minute (`cacheLife("minutes")`). The `sitemap.adsCache` probe check drifts unless a repeated read reports `cf-cache-status: HIT` |
| Volume | The source returns at most 50,001 entries; the route serves the newest 50,000, the sitemap protocol's per-file limit |
| Signals | Every render logs `ad-sitemap.rendered` with `urlCount`; overflow also logs error `ad-sitemap.limit_exceeded`; read failures log `ad-sitemap.read_failed` and return `503` |
| Drift | The `sitemap.ads` probe check counts `<url>` entries and drifts above 40,000, or on any status other than `200` |

Drift above 40,000 is the signal to split the file into a sitemap index before
Anúncios stop being listed. Verify the threshold logic with
`npm run test:unit -- bin/edgeProbeMeasurements.test.ts`.

## Precedence

- **Measured for this zone:** the web application's response contains application crawler
  directives; Cloudflare contributes neither its default policy nor a managed-content
  block.
- **Cloudflare's documented behavior if managed content is enabled:** it prepends its
  block to an origin `robots.txt` and preserves the origin directives below the
  `# END Cloudflare Managed Content` marker. With no origin file, Cloudflare creates the
  response. See [Cloudflare managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/).

Cloudflare also documents that the default policy appears when the origin has no file.
The application route is therefore the source of the measured crawler directives today;
managed content, if enabled later, can prepend its block while preserving the origin
directives. Do not change an edge setting merely to test precedence; the probe will
report the next real change from either layer.

## Change ownership

| Change | Owner |
|---|---|
| Application directives or `Sitemap:` pointer | Next.js route in this repository |
| Managed Content Signals policy | Cloudflare dashboard or imported infrastructure |
| Apex `/robots.txt` redirect | Cloudflare Single Redirect; see the [apex runbook](apex-redirect-runbook.md) |

Edge changes are production operations: propose them, follow
[production operations](production-operations.md), and rerun the probe after an
authorized change. Consult [production evidence](production-evidence.md#robots-history)
only when the prior policy or its issue provenance matters.
