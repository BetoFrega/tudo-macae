# Production delivery evidence

Load this history only when a current production claim needs provenance or an operational
procedure needs its safety rationale. Current behavior belongs to the
[delivery](production-topology.md), [crawling](production-crawling.md) and
[operations](production-operations.md) contracts.

## Redirect ownership

The investigation behind `#334` began with the assumption that the apex redirect was a
Cloudflare rule. Responses from the HTTPS apex carried `via: 1.1 google`,
`server-timing` and `cdn-cache-status`, establishing that App Hosting produced the
redirect. Cloudflare could not add those origin markers to a response synthesized at
its own edge.

Measured path-specific cache controls differed: `/` returned `max-age=60`, while
`/robots.txt` returned `max-age=14400`. The values are evidence, not a general rule.

## Robots history

- On 2026-08-16, `#334` observed a Cloudflare-managed `robots.txt` whose Content Signals
  Policy blocked several AI crawlers while the origin had no file.
- On 2026-08-18, two network paths and four user agents observed the managed file gone
  and the origin returning `404`.
- On 2026-08-19, the owner confirmed that the AI-crawler block and managed file were
  disabled deliberately. `#357` tracks an application-owned `robots.txt`.
- On 2026-08-27, the path began returning `200` with Cloudflare's default Content Signals
  Policy but no managed directives. The repository still had no origin file. Current
  Cloudflare documentation identifies this as the Free-plan default when neither an
  origin file nor managed `robots.txt` exists.

The 2026-08-27 response preserved App Hosting headers, which is why the probe reports the
responding layer and Cloudflare body signatures independently.

## Cache and bot evidence

- `#227` is the stale-listing incident that established why Cloudflare cache purge is the
  wrong repair for stale application HTML.
- Comparing the public site with `tudomacae-test` isolated Cloudflare's injected
  bot-detection script: it appeared only on the edge path.
- The same challenge explains why a plain automated fetch can return `403` without the
  site being unavailable to a browser.

## Inventory provenance

The production inventory found two Firebase TXT records, Cloudflare Email Routing MX,
SPF, DKIM and DMARC records. Re-measure that non-normative inventory when it matters:

```bash
dig +short tudomacae.com.br NS TXT MX @1.1.1.1
dig +short _dmarc.tudomacae.com.br TXT @1.1.1.1
dig +short cf2024-1._domainkey.tudomacae.com.br TXT @1.1.1.1
```

The production backend's default URI returned a Google `404` without Next.js markers;
`tudomacae-test` was the usable origin-side comparison. Revalidate the backend inventory
through the command in [production operations](production-operations.md#current-backend-inventory).

## Related records

- `#334` — original edge inventory.
- `#357` — application-owned `robots.txt`.
- `#330` — canonical URLs and `metadataBase`.
- `#281` — indexing work and sitemap constraints.
- [Initial production findings](https://app.notion.com/p/fc624c69b3574cc4a9652121f9e7d4ad).
- [Contexto e restrições do projeto](https://app.notion.com/p/3f684301eab381729f7beeac49c87944) — product constraints derived
  from the deployed topology.
