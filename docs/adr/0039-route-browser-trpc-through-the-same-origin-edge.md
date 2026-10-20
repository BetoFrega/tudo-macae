---
record: adr
id: "0039"
status: accepted
decided: 2026-10-05
---

# 39. Route browser tRPC through the same-origin edge

## Context and requirements

[0038](0038-deploy-workers-web-and-trpc-api-separately.md) separates web and API
deployments. The browser still needs an HTTP endpoint for tRPC. The existing
edge selects origins under the canonical web hostname; inspect its composition
with `cat apps/www-origin/index.ts` and follow the
[production delivery contract](../agents/production-topology.md).

## Decision

Expose the browser's tRPC endpoint at `/api/trpc` under the canonical web origin.
The edge forwards that endpoint and its procedure paths to the API Worker;
web journeys continue to use the web origin selected for that journey.
Frontend and API remain separate deployments.

## Alternatives and consequences

The maintainer accepted same-origin edge routing on 2026-10-05 after comparing
it with a dedicated API subdomain. Same-origin access avoids cross-origin CORS
configuration for the web client and uses the existing edge boundary.
A dedicated subdomain would require an additional browser-origin and credential
policy without a demonstrated requirement in this migration.

The edge becomes part of the browser API request path. Its route selection and
failure behavior need qualification alongside the API contract. Same-origin
access does not authorize an operation: authentication, authorization and
request forgery protection remain requirements of the API design. Reconsider
the ingress choice if edge qualification cannot preserve required credential,
private-cache or failure semantics; a dedicated API origin would then need its
own browser-origin and credential qualification.

## Scope and amendments

On 2026-10-05 the maintainer also selected an HTTP service binding for SSR calls
from the web Worker to the API Worker. These calls use the same tRPC HTTP
contract as the browser, with the client fetch adapter invoking the binding.
They do not traverse the public edge again or import the API implementation
into the web deployment. This supplements the browser ingress decision.

[Cloudflare documents forwarding Requests through the binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/);
[tRPC's HTTP client accepts a fetch adapter](https://trpc.io/docs/client/links/httpBatchLink).
Qualification must prove both request paths against the actual API runtime.
Credential forwarding and correlation remain request-scoped design work;
a service binding alone does not establish the visitor's authority.

On 2026-10-06 [0041](0041-replace-firebase-auth-with-better-auth-in-the-first-backend-cut.md)
selected the authentication replacement. Qualify request-scoped credential
propagation in that cut; the exact client and SSR adapters remain implementation
work. Machine protocols retain their existing contracts, and unmigrated Cloud Run
consumers use the new authentication authority. No production route, binding or
API endpoint has been created by accepting this record.
