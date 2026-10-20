# PostHog server tracing

The Next.js Node runtime registers OpenTelemetry from `src/instrumentation.ts`.
Next.js supplies framework spans; this setup does not instrument
browser spans or downstream service SDKs. Standard W3C trace context propagation
is registered without baggage propagation; other services need their own setup. Existing structured error diagnostics
remain the server-health signal.

## Release controls

Classification: flagged, because tracing exports to an external service and adds
usage. Owner: repository maintainer. Initial audience: one controlled environment.

The PostHog boolean flag `server-tracing` is the sole release control. Keep it
inactive in the same EU project as `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`. Evaluation
sends an empty `distinct_id`, as [PostHog identity](../../OBSERVABILITY.md#posthog-identity)
requires. Each decision sends `person_properties.environment`, with one of
`production`, `development`, `test` or `build`. Target the pilot using a person
property condition `environment = production` (or the chosen environment),
instead of enabling an unconditional rollout. Missing tokens,
flags, malformed responses and unavailable evaluations leave export off.
No personal API key is needed.

Production requires the `K_SERVICE` marker, which the web Worker's production
environment in `wrangler.web.jsonc` sets, and production Node mode. Test mode or `NEXT_PUBLIC_APP_ENV=test` classify as test; Next.js production-build phase
classifies as build. Local `next start` alone does not classify as production.
The same bounded environment value is used in exported resource metadata.

The Node provider is registered at startup when a valid project token exists,
including while the flag is off. It collects bounded diagnostic samples locally;
each export batch checks the flag before sending traces. Decisions are cached
for at most 60 seconds. Enable or disable the flag to change ingestion without
restarting the instance or redeploying. Provider initialization and local span
processing still have overhead while ingestion is disabled.

The browser analytics proxy is not used for OTLP: the server sends protobuf to
`https://eu.i.posthog.com/i/v1/traces` with bearer project-token authentication.

## Privacy and volume

Export preserves trace/span/parent identifiers, timestamps, duration, span kind,
status code, numeric HTTP status, approved framework operation names and the
controlled service, environment and release resource. It drops raw span names,
other attributes, events, exception text, links, trace state and upstream resource
or instrumentation metadata. Route paths and query strings are not exported.

The sampler selects 10% of trace IDs regardless of a caller's sampled bit. The
queue holds at most 512 spans, batches at most 128, with a one-second scheduled
export and five-second HTTP timeout. These are diagnostic samples, not complete
failure counts. Use existing structured diagnostics for aggregate health.

Before activation, approve ingestion and retention costs under `OBSERVABILITY.md`:
measure request volume and spans per request, estimate monthly ingestion as
requests × average spans × 0.1, check current PostHog pricing and retention, and
set a project budget/review threshold. Keeping existing logs alone is the
lower-cost alternative. Review after the first 24 hours of pilot ingestion;
stop if sensitive data appears or the agreed budget is exceeded. Retire the flag
or abandon tracing within 90 days of pilot activation; record that cleanup in
the rollout ticket.

## Verification and flushing

Run the focused unit tests (`npm run test:unit -- src/posthogTracing.test.ts src/instrumentation.test.ts src/requestErrorDiagnostics.test.ts`), `npm run typecheck`, and the affected public
journey E2E before delivery. The unit tests use real SDK spans and an in-memory
exporter; they do not prove PostHog ingestion.

For a controlled pilot, enable the flag, request a dynamic page,
and inspect PostHog Tracing for service `tudo-macae-nextjs`. Confirm durations,
parent relationships, sampling volume and absence of private fields. Read back
provider retention before asserting compliance. Verify disabling the flag stops
new exports after the decision-cache interval.

Batch delivery requires available CPU. For custom Route Handler spans on hosts
that suspend CPU after a response, schedule `flushPosthogTracing()` from
`src/posthogTracing.ts` with `after()` from `next/server`, or await it before
returning. This setup has not established guaranteed delivery after a web Worker
response completes; verify the deployed hosting behavior
before relying on it operationally.

Reference: [PostHog Next.js installation](https://posthog.com/docs/distributed-tracing/installation/nextjs).
