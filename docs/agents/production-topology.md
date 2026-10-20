---
trigger: when_reasoning_about_production_delivery
---

# Production delivery contract

**Cloudflare faces the internet; the web application Worker serves `www` behind the router Worker.** Repository deployment files do
not describe that outer layer, so reason about production from this contract and its
probe rather than from `wrangler.web.jsonc` or `next.config.ts` alone.

Load the branch that owns the question:

- [Production crawling](production-crawling.md) owns `robots.txt`, crawler policy and
  precedence between edge and application directives.
- [Production operations](production-operations.md) owns dashboard-only state,
  configuration gaps and infrastructure adoption.
- [MCP edge runbook](mcp-edge-runbook.md) owns the machine hostname, origin
  proof, credential-free probe, alerts and manual rollout evidence.
- [`www` edge Worker runbook](www-origin-runbook.md) owns the router that serves
  `www` from the web application Worker and its recovery by Worker version.
- [Apex redirect runbook](apex-redirect-runbook.md) owns the applied Cloudflare
  rule, activation, verification and return path for the canonical redirect.
- [Production delivery](production-delivery.md) owns the Worker release pipeline,
  index readiness, independent environment configuration and version recovery.
- [Authentication migration](authentication-migration.md) owns qualification, the
  single-writer transfer barrier and recovery of the identity API slice.
- [Production evidence](production-evidence.md) is conditional provenance for a claim
  whose current measurement needs explanation.

## Production probe

Re-measure the public contract without changing production:

```bash
npm run probe:edge
```

The probe is [`bin/probe-edge.mjs`](../../bin/probe-edge.mjs). It runs weekly and on
demand through [the edge-probe workflow](../../.github/workflows/edge-probe.yml). Drift
opens or updates one `edge-drift` issue. It stays outside pull-request checks because it
requires the public internet and Cloudflare may challenge automated clients.

| Exit | Meaning                                     | Required response                                       |
| ---- | ------------------------------------------- | ------------------------------------------------------- |
| `0`  | Every measurement matches this contract     | Continue                                                |
| `1`  | Production and the recorded contract differ | Decide which is authoritative and update the other      |
| `2`  | The probe could not measure after one retry | Repair the vantage point; this is not evidence of drift |

This branch owns the delivery measurements below. Details that rotate independently,
such as certificate issuer, anycast address and cache age, are reported but not asserted.

| Probe id                                     | Normative delivery measurement                                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dns.nameservers`                            | The zone is delegated to Cloudflare                                                                                                                                                                                   |
| `dns.proxied`                                | Apex and `www` share proxied addresses and `/cdn-cgi/trace` answers                                                                                                                                                   |
| `tls.termination`                            | The public certificate has a wildcard SAN, identifying Cloudflare Universal SSL                                                                                                                                       |
| `redirect.apex.http` / `redirect.apex.https` | Cloudflare Single Redirect sends HTTP and HTTPS apex requests directly to HTTPS `www` with `301`, preserving path and query, with no App Hosting markers                                                              |
| `cache.document`                             | Cloudflare stores no HTML; `www` documents come from the web application through the edge Worker (`x-www-origin: terms-workers`); `/` is private/no-store, including `CDN-Cache-Control: no-store`, while `/noticias` requires revalidation before reuse |
| `cache.asset`                                | Cloudflare caches immutable build assets under `/_terms-workers/<sha>/`                                                                                                                                                |
| `edge.botDetection`                          | Cloudflare injects its browser bot-detection script into HTML                                                                                                                                                         |
| `headers.security`                           | Neither layer sets the asserted security-header set                                                                                                                                                                   |
| `dns.mcp` / `tls.mcp`                        | The MCP hostname resolves through Cloudflare and completes wildcard TLS                                                                                                                                               |
| `mcp.origin`                                 | The edge Worker answers the retired machine host itself (`x-www-origin: edge`), with no App Hosting CDN markers                                                                                                     |
| `mcp.retired`                                | The MCP initialize, `/mcp`, `/tools/v1` and `/sessions/v1` requests all return `404` with `no-store` and no browser challenge                                                                                         |
| `mcp.cache`                                  | MCP responses are `no-store` and stay out of Cloudflare, App Hosting and Next.js caches                                                                                                                               |

The [crawling branch](production-crawling.md) owns the independent
`robots.precedence`, `sitemap.ads` and `sitemap.adsCache` measurements.

## Request path and ownership

```text
client
  → Cloudflare          authoritative DNS, proxy, TLS, edge rules, bot detection
  → edge Worker         `www`; answers the retired MCP host itself
  → web Worker          vinext build of the application and its data cache
```

The apex redirect runs at Cloudflare; its
activation evidence and recovery are in the [runbook](apex-redirect-runbook.md).

The response markers identify the layer that produced or cached it:

| Layer                      | Relevant markers                                                                       | Owns                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cloudflare                 | `cf-ray`, `cf-cache-status`, `server: cloudflare`                                      | Public DNS/TLS, edge cache, bot and edge rules                       |
| edge Worker                | `x-www-origin`                                                                         | `www` routing to the web Worker; the retired MCP host's `404`        |
| Cloudflare Single Redirect | Cloudflare markers without App Hosting markers                                         | Canonical apex redirect                                              |
| web Worker                 | `x-terms-worker-version`                                                               | Rendering and application cache                                      |

Cloudflare and Next.js cache markers describe independent caches.
`via: 1.1 google` or `cdn-cache-status` would indicate an unexpected App Hosting path.

## Current delivery behavior

### DNS, TLS and canonical host

- Cloudflare is the authoritative DNS provider and proxies both apex and `www`.
- Cloudflare terminates public TLS. The origin address and Cloudflare-to-origin SSL mode
  are dashboard-only state; follow the [operations branch](production-operations.md)
  when either matters.
- `www` is canonical. The apex redirect is the Cloudflare Single Redirect
  described in the normative measurements above.

### Cache ownership

- Cloudflare does not cache HTML under the measured policy. `www` documents come
  from the web Worker through the edge Worker (`x-www-origin: terms-workers`). The visitor-specific `/` document uses
  `Cache-Control: private, no-store, max-age=0, must-revalidate` and
  `CDN-Cache-Control: no-store`; `/noticias` uses
  `Cache-Control: public, no-cache, max-age=0, must-revalidate` before an external CDN
  reuses it. Verify both policies with `npm run probe:edge`. These response policies preserve the independent Next.js data and
  component caches. `x-nextjs-cache`, when present, is diagnostic rather than a
  delivery invariant.
- Cloudflare caches immutable `/_terms-workers/<sha>/_next/static/**` assets.
- The `www` edge Worker stores the public reads in
  [`edgeCachedPaths`](../../packages/www-origin-routing/lib/edgeCache.ts) in each
  colo's Cloudflare cache through the Workers Cache API, for the application's `max-age`.
  A service binding response is never cached by itself; a stale entry lives in that
  Worker-managed cache, keyed by the `www` URL without query.
- Purging Cloudflare cannot clear stale HTML it never held. Diagnose stale `www` HTML
  at the web Worker version and its data cache.

### Edge-added behavior

- Cloudflare injects `/cdn-cgi/challenge-platform/scripts/jsd/main.js` into HTML. A plain
  fetch may therefore return `403` while an interactive browser succeeds, and public
  HTML can contain code absent from a local build.
- The measured document response has no `strict-transport-security`,
  `content-security-policy`, `x-content-type-options`, `x-frame-options` or
  `referrer-policy` header. Adding them is a production design decision, not a
  documentation repair.

Treat every edge-rule change as a proposal. Apply it only through an explicitly
authorized production operation, then rerun the probe.
