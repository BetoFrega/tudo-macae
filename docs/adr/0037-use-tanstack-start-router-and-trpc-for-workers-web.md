---
record: adr
id: "0037"
status: partially-superseded
decided: 2026-10-05
---

# 37. Use TanStack Start, Router and tRPC for the Workers web migration

## Context and requirements

The [Workers migration spec #1406](https://github.com/BetoFrega/macae-classificados/issues/1406)
owns the journey-by-journey migration and its delivery evidence. Its initial
renderer is vinext, using Next APIs. Public pages need server-rendered content
and route metadata. Inspect the existing composition with
`cat apps/web-workers/package.json apps/web-workers/vite.config.ts apps/web-workers/app/termos-e-condicoes/page.tsx`;
inspect other public metadata with `rg -n 'generateMetadata|metadataBase' src/app`.

The package extraction in [#1585](https://github.com/BetoFrega/macae-classificados/issues/1585)
provides shared rules and React interfaces. The new renderer must consume those
public interfaces and respect [domain infrastructure seams](../agents/domain-infrastructure-seams.md).
Public freshness remains governed by [0017](0017-revalidate-immediately-fresh-public-html.md).

## Decision

Use TanStack Start with TanStack Router for the target Workers web application,
preserving server rendering for public pages. Use tRPC for its typed application
API. This replaces the preference for vinext in #1406's target design.

Start owns rendering and web composition; Router owns route matching and
navigation. tRPC is an application transport, consuming domain entry points
rather than defining an alternative set of business rules.

## Alternatives and consequences

The maintainer accepted this option in the design interview on 2026-10-05 after
comparing Start, Router with custom SSR, and a browser-rendered SPA. Start provides
the SSR integration; custom SSR would require us to assemble and maintain it.
A SPA would require a separate answer for initial public HTML and metadata.

[Cloudflare documents Start deployment on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/),
and [tRPC documents its Fetch adapter for Workers](https://trpc.io/docs/server/adapters/fetch).
These establish available integration paths, not compatibility of our complete
application. Each migrated journey still needs real builds, runtime checks,
metadata, accessibility and recovery verification.

Next-specific rendering, metadata, navigation and asset integration need adapters
or replacements. A concrete failure to preserve a required journey or operate
the stack within measured constraints would justify reconsidering this choice.

## Scope and amendments

On 2026-10-17 [ADR 0046](0046-move-the-next-application-to-workers-with-vinext.md)
superseded the replacement of vinext as the way off Cloud Run: the current Next
application moves to Workers with vinext as a bridge. TanStack Start, Router and
tRPC remain the target for new or rewritten journeys.

This record accepts the target framework and transport. API deployment topology
is recorded in [0038](0038-deploy-workers-web-and-trpc-api-separately.md).
HTTP access paths are recorded in
[0039](0039-route-browser-trpc-through-the-same-origin-edge.md).
Backend-first migration including authoritative persistence is recorded in
[0040](0040-migrate-backend-before-replacing-the-web-renderer.md).
The first backend capability is authentication; its provider choice is recorded
in [0041](0041-replace-firebase-auth-with-better-auth-in-the-first-backend-cut.md).
The first renderer replacement is selected after backend qualification.
The maintainer confirmed the complete design on 2026-10-06 for consolidation
in #1406.

Existing deployments and qualified journeys retain their implementation until
their replacements are delivered and authorized. Acceptance does not certify a
build, deployment, audience change or transfer of data authority.
