---
record: adr
id: "0040"
status: partially-superseded
decided: 2026-10-05
---

# 40. Migrate backend capabilities before replacing the web renderer

## Context and requirements

The [#1406 redesign](https://github.com/BetoFrega/macae-classificados/issues/1406)
selects [separate web and API Workers](0038-deploy-workers-web-and-trpc-api-separately.md).
On 2026-10-05 the maintainer chose backend-first migration with runtime and
persisted data transferred together, while the current Next application remains
a consumer.
Current domain extraction does not transfer persistence: inspect
`src/integrations/ads` and `src/integrations/authentication/session.ts`.

## Decision

Migrate a bounded backend capability into the tRPC API Worker, including its
domain rules and authoritative persistence in Cloudflare. Use D1 for domain
data and R2 for non-image files where the capability requires them, subject to
verification of its transactions, concurrency and storage semantics. Images use
Hosted Images under [ADR 0043](0043-use-cloudflare-hosted-images-across-surfaces.md).
Adapt its current
Next consumers, and qualify the complete existing journey
before replacing its renderer with TanStack Start. The existing interface is a
real consumer of the new API, not a reason to keep an alternative domain writer.

Complete the backend capabilities in the migration scope before beginning the
new frontend replacement. Backend cuts remain incremental and are validated
through their current Next consumers. Do not alternate backend and Start
frontend replacements for each capability. Existing qualified Workers pages
keep their current implementation and exposure during the backend phase.

Runtime-only replacement with Firestore persistence, or an API facade that still
executes the migrated capability in Cloud Run, does not complete this cut.
Unmigrated capabilities keep their current execution and data authority.
Firebase Auth remains the current identity provider; its integration into the
new API requires qualification and is not a transfer of identity ownership.

Cloud Run server rendering requires an HTTP client to the remote API;
the [Workers SSR service binding](0039-route-browser-trpc-through-the-same-origin-edge.md)
applies when rendering moves to the Start Worker. tRPC's
[standalone client](https://trpc.io/docs/client/vanilla) provides an integration
path independent of the web framework; compatibility remains to be qualified.

## Alternatives and consequences

Frontend-first migration could preserve backend execution in Cloud Run behind
temporary endpoints. Backend-first instead lets existing journeys exercise
the new API before renderer replacement, separating the causes of regressions.
It requires adapting old consumers and preserving compatible API versions.
Migrating runtime and data together makes each backend cut larger than moving
only execution, but establishes its target persistence before changing the renderer.
The maintainer also selected completing the backend phase before the frontend
phase, rather than alternating both for each capability. This keeps renderer
changes out of backend qualification, at the cost of delaying the new frontend
and maintaining its temporary Next consumers throughout the backend phase.

A capability keeps one authoritative writer. Recovery must preserve valid
activity produced after activation; renderer recovery alone cannot reverse
a transfer of data authority. Existing callers, jobs and machine consumers
must be accounted for in the capability's cut.

## Scope and amendments

On 2026-10-17 [ADR 0046](0046-move-the-next-application-to-workers-with-vinext.md)
moved the current Next composition to Workers with vinext after the backend
cuts. Moving that runtime is not the renderer replacement this record orders
after the backend phase; backend-first ordering, data authority and recovery
remain in force for any journey later rewritten in TanStack Start.

On 2026-10-10 [ADR 0043](0043-use-cloudflare-hosted-images-across-surfaces.md)
superseded R2 as the destination for image bytes across all surfaces. Backend-first
ordering, D1 data authority, compatibility and recovery remain in force.

On 2026-10-06 [ADR 0041](0041-replace-firebase-auth-with-better-auth-in-the-first-backend-cut.md)
superseded the Firebase Auth retention and corresponding first-cut qualification
requirements below. It expands the authentication cut; the backend-first ordering,
data-authority and recovery decisions remain in force.

On 2026-10-05 the maintainer selected Access Account authentication and email
verification as the first backend cut. It preserves Firebase Auth and the
[email verification contract](https://app.notion.com/p/3ff84301eab381c09277c57aed13fe53), while moving
the implemented verification-attempt state to authoritative D1 persistence.
No file storage is required for this capability. Continuations to Ads and
Advertiser Identities remain in their current Next composition.

Before exposure, prove Firebase session issuance, verification, revocation,
current account status and roles in the real Workers runtime; current Admin SDK
adapters are not compatibility evidence. Preserve concurrent send reservation
and conditional completion in the D1 adapter. The Firebase adapters were removed
after the cut; inspect the D1 guarantees with
`cat apps/api-worker/lib/authentication.ts apps/api-worker/lib/db/emailVerification.ts`.
The cut must be independently exposable, observable and recoverable.

Historical-data transfer, in-flight changes, authority handoff and recovery
compatibility are exposure gates for each cut. A generic dual-write or replication
mechanism is not selected by this record; the capability must justify its transition.

On 2026-10-06 the maintainer selected qualification with disposable test accounts
followed by a controlled global activation for the first cut. This avoids retaining
parallel production account cohorts across anonymous registration, password recovery
and authenticated flows. Activation requires preserving verification-attempt state
and in-flight operations. Once D1 accepts new writes, recovery must retain D1 as
authority or reconcile those writes before transferring authority back; switching
traffic alone does not recover the data.

Acceptance does not certify an API deployment, database migration or changed
production journey.
