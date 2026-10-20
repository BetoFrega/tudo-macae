---
record: adr
id: "0038"
status: partially-superseded
decided: 2026-10-05
---

# 38. Deploy the Workers web application and tRPC API separately

## Context and requirements

[0037](0037-use-tanstack-start-router-and-trpc-for-workers-web.md) selects the
web framework and application transport for [migration #1406](https://github.com/BetoFrega/macae-classificados/issues/1406).
That choice leaves deployment topology open. The current edge already invokes
the web Worker through a service binding; inspect it with
`rg -n 'WEB_WORKER|fetchWebWorker' apps/www-origin/index.ts`.

## Decision

Deploy the TanStack Start web application and the tRPC API as separate
Cloudflare Workers, each with its own application workspace, build and release
configuration. Their versions can be published and recovered independently.

Separate deployment requires a verified API contract between compatible web
and API releases. A web rollback does not imply an API or data rollback.
Each journey's qualification must identify both revisions and prove its
supported release combinations.

## Alternatives and consequences

The maintainer selected separate Workers on 2026-10-05 after comparing this
topology with a separate API module in the same web Worker and deployment.
Co-location would simplify initial operation but couple publishing and recovery.
The chosen topology accepts inter-service communication and compatibility work
in exchange for independent releases.

[Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
provide an available communication mechanism. Browser ingress and SSR transport are selected in
[0039](0039-route-browser-trpc-through-the-same-origin-edge.md);
request-scoped credential propagation must be qualified with the authentication
cut in [0041](0041-replace-firebase-auth-with-better-auth-in-the-first-backend-cut.md).
Separate Workers isolate deployments; API failures can still affect dependent
web journeys. Reconsider separation if qualification shows that inter-service
latency or release compatibility cannot meet a required journey despite bounded
mitigations; compare the measured result with a co-located deployment.

## Scope and amendments

On 2026-10-17 [ADR 0046](0046-move-the-next-application-to-workers-with-vinext.md)
made the current Next application, built with vinext, the deployed web Worker
until a journey is rewritten in TanStack Start. Separate web and API Workers,
independent releases and their compatibility requirements remain in force.

The API decision does not split domain capabilities into separate services or
change the [existing machine edge contract](0014-a-machine-specific-edge-contract-for-mcp.md).
Machine protocols, data authority and coexistence with Cloud Run remain governed
by their current records until explicitly redesigned.

Acceptance records the target topology. Worker creation, deployment, routing
changes and migration of data have not been performed by this decision.
