---
record: adr
id: "0017"
status: accepted
decided: unknown
---

# 17. Require origin validation before reusing immediately fresh public HTML

Public HTML whose content must reflect a completed mutation on the next visit must not remain fresh independently in an external CDN. Next's `updateTag`/`revalidateTag`/`revalidatePath` update its own caches; they do not automatically purge a CDN's stored response. Keep the Next data/component caches and require origin validation before reusing this public HTML. This trades more requests to the origin for the required publication and navigation freshness.

Declare the policy in `next.config.ts` through `headers()` for the specific public routes that need this contract:

```text
Cache-Control: public, no-cache, max-age=0, must-revalidate
```

`public` permits shared storage only because these responses contain public content. `no-cache` permits storage but requires validation before reuse; it is different from `no-store`, which forbids storing the response. `max-age=0` gives browsers no freshness interval, and `must-revalidate` forbids serving an expired copy without validation. Validators may avoid retransmitting an unchanged body, but validation still reaches the origin. Do not append a positive shared freshness interval or `stale-while-revalidate` when the route promises immediate visibility after mutation.

Use this policy for public HTML that must immediately reflect publication, removal or catalogue changes. Keep explicit TTL/SWR policies for public responses where stale content is acceptable and the freshness interval is a deliberate product decision. Preserve the framework's protections for authenticated or private responses; never add `public` to them. Operational and credential-bearing responses retain their existing `no-store` contracts. Hash-addressed immutable assets retain their long-lived `immutable` policy; this decision does not override their headers or disable server-side caching.

Apply the policy at the response boundary, not by adding query strings, request headers, sleeps, retries or cache-purge endpoints to tests. Before extending it to another route, verify that the response is public, that immediate freshness is required, and that the additional origin traffic is accepted. Keep the framework's `Vary`/RSC handling intact. Verify the effective HTTP response both locally and through App Hosting/CDN, then exercise the mutation followed by the ordinary canonical URL. A matching configuration object or a successful cache-busting request is insufficient evidence.

The initial routes and executable HTTP contract are owned by `next.config.ts` and `tests/e2e/navigation/cache-surface.spec.ts`; the category and newsroom journeys verify visible changes. This ADR records the decision and its boundary. Production execution requires its separate approval; a staging result does not establish production deployment.

References: [Firebase App Hosting caching](https://firebase.google.com/docs/app-hosting/optimize-cache), [Next.js CDN caching](https://nextjs.org/docs/app/guides/cdn-caching), and [ADR 0014](0014-a-machine-specific-edge-contract-for-mcp.md) for the separate non-cacheable editorial MCP contract.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0017-revalidate-immediately-fresh-public-html.md) preserves earlier dated wording and superseded clauses.
