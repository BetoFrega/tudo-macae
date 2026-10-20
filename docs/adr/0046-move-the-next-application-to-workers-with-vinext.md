---
record: adr
id: "0046"
status: accepted
decided: 2026-10-17
---

# 46. Move the current Next application to Workers with vinext as a bridge

## Context and requirements

The [Workers migration spec #1406](https://github.com/BetoFrega/macae-classificados/issues/1406)
moves the web application off Cloud Run. [ADR 0037](0037-use-tanstack-start-router-and-trpc-for-workers-web.md)
selected TanStack Start as the target renderer and [ADR 0040](0040-migrate-backend-before-replacing-the-web-renderer.md)
ordered backend cuts before the renderer replacement. The backend cuts for
Authentication, Classifieds and Editorial now hold their authority in the API
Worker, and the application no longer depends on Firebase at runtime. Rewriting every journey
in Start is the remaining cost of leaving Cloud Run.

A trial in [#2179](https://github.com/BetoFrega/macae-classificados/pull/2179)
built the unchanged `src/app` application with vinext and ran it in local
workerd. On 2026-10-17 the full E2E collection passed 88 of 94 cases under
vinext and 90 of 94 under `next start`; two failures were specific to vinext and
none blocked a journey. Reproduce with `E2E_RENDERER=vinext npm run test:e2e:full:diagnostic`
on that branch.

Two runtime differences shape the move:

- Cloud Run serves one instance (`git show 66a53d70:.github/actions/cloud-run-candidate/action.yml | grep -n max-instances`),
  so the in-memory `"use cache"` store is coherent today. Workers run many
  isolates, so the store must be shared for `updateTag` to reach every reader.
- vinext prefetch renders the whole destination page, where Next fetches only
  the route tree and static shell. Measured on 2026-10-17 for a visitor on `/`,
  `/negocios` and `/noticias` in the E2E stack: 10 requests and 194 KB under
  vinext against 14 requests and 63 KB under Next. Without prefetch on the global
  header, rail and footer links, vinext made 4 requests and 69 KB. The probe
  visits the three pages with `page.goto`, waits for network idle and sums the
  response bodies of every `_rsc` request; run it as a spec under `tests/e2e`
  with `E2E_RENDERER=vinext npm run test:e2e:diagnostic -- <spec>`.

## Decision

Move the existing Next composition in `src/app` to a Workers application built
with vinext, without rewriting its pages. The Worker replaces Cloud Run journey
by journey through the edge router in `packages/www-origin-routing/lib/journeys.ts`:
each journey gets a route flag and a canary, and falls back to Cloud Run until
its flag is on. Delivery runs through the GitHub deploy workflow.

`"use cache"` uses one shared store whose invalidation reaches every isolate.
The trial keeps vinext's memory handler inside a single Durable Object
(`web-worker/dataCache.ts` on #2179). Outbound calls from the renderer use
service bindings instead of Google identity tokens.

The edge router was built for the Terms page and does not yet carry a whole
journey. Before a journey's flag is turned on, its qualification proves each of
these, and the router changes that they need ship first:

- **Response policy.** `serveJourney` in `packages/www-origin-routing/lib/webWorker.ts`
  replaces every Worker response's `Cache-Control` with `private, no-store` and
  treats every 404 as an unavailable Worker. The router keeps each route's
  policy under [ADR 0017](0017-revalidate-immediately-fresh-public-html.md) and
  passes an application 404 through, falling back only on a failure signal
  distinct from it.
- **Server Actions.** `selectedJourney` in `packages/www-origin-routing/lib/requests.ts`
  admits only reads, so actions run on Cloud Run against another build and clear
  only the Cloud Run cache. A journey that renders an action, or whose cached
  data a Cloud Run action invalidates, moves with its actions, or its
  qualification proves build affinity for them. Tags are not synchronized
  between runtimes: until a journey's writers move, the Worker serves data a
  Cloud Run action changed until its `cacheLife` expires.
- **Diagnostics.** `src/instrumentation.ts` and `src/posthogTracing.ts`
  recognize production through Node and Cloud Run variables (`NEXT_RUNTIME`,
  `K_SERVICE`, `K_REVISION`). The Worker emits the signals, correlation and
  release identity that [OBSERVABILITY.md](../../OBSERVABILITY.md) requires, and
  qualification reads them from the Worker's logs.
- **Renderer boundaries.** RSC requests are routed by destination path
  (`selectedJourney`), so a client navigation or a flag rollback can mix the
  Next and vinext builds. Navigation across a renderer boundary becomes a full
  document load, unless qualification proves the two builds compatible.
- **Fallback and edge caches.** A journey with an `edgeCachedPaths` resource
  evicts or partitions the colo cache entry when its flag changes, since
  `createWwwOriginRouter` answers a cache hit before evaluating the journey.

TanStack Start stays the target for new or rewritten journeys under 0037. A
journey can move from the bridge to Start later; the bridge does not need to be
retired first.

## Alternatives and consequences

- **Rewrite in TanStack Start before leaving Cloud Run.** Cloud Run, its build
  and its deploy steps stay until every journey is rewritten.
- **OpenNext on Workers.** It also runs the Next build unchanged, but adapts the
  Node output rather than targeting workerd, and the repository already serves
  the Terms page with vinext in `apps/web-workers`.
- **Cloudflare's Response Store adapter** for the shared cache. It invalidated
  correctly in the trial but also took over page caching, changing the home
  page's `Cache-Control` against [ADR 0017](0017-revalidate-immediately-fresh-public-html.md).

The bridge keeps Next APIs, and their vinext emulation, in the code longer.
Prefetch cost and Durable Object latency from Brazil must be measured on a
qualification Worker before the first journey moves; disabling prefetch on
global links is the first mitigation. A required journey that vinext cannot
preserve, or Worker cost beyond what the measurements allow, would justify
rewriting that journey in Start instead.

## Scope and amendments

This record amends [0037](0037-use-tanstack-start-router-and-trpc-for-workers-web.md),
[0038](0038-deploy-workers-web-and-trpc-api-separately.md)
and [0040](0040-migrate-backend-before-replacing-the-web-renderer.md); their
amendments on 2026-10-17 state what remains in force. The maintainer chose this
option on 2026-10-17 after the trial results in #2179. On 2026-10-18 the
maintainer dropped the requirement that a mutation invalidate both runtimes'
application caches: the work goes into removing Cloud Run, and stale Worker
reads last only until the writers move.

Acceptance does not certify a Worker build, a deployment or any journey moved to
it. Each journey needs its own qualification and activation.
