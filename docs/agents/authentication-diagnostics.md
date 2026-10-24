# Authentication diagnostics

Use this guide when diagnosing an authentication dependency failure, preventing
repeated session lookups or activating correlated diagnostics. [Observability](../../OBSERVABILITY.md) owns privacy,
cost approval and verification; [authentication operation](authentication-migration.md)
owns authority, deployment and recovery. Diagnostic delivery alone does not resolve
an incident.

## Signals

`authentication.client.failed` and `authentication.worker.failed` retain each
unexpected failure at their respective HTTP boundary. The matching `.completed`
events randomly select 10% of non-failing outcomes after the result is known,
independently at each boundary. Caller-supplied IDs cannot choose the success cohort. Existing Next
request-error logs and PostHog traces remain available; trace sampling stays at 10%.
Classifieds routes retain their separate events, identifiers and operation budgets;
this mode does not impose the authentication deadline on that chain.

The root `correlationId` starts at the first infrastructure boundary. The `www`
Worker uses its Cloudflare ray, or creates a UUID when that provider ID is absent,
overwriting client-supplied root headers. Its routing log calls this value `requestId`
and also exposes `correlationId`; `x-www-request-id` carries it to the origin.
Next extracts only that validated identifier into request-scoped OpenTelemetry
context, independently of trace export or sampling. No request-time rendering API
is needed to read it. Authentication calls forward the same root in
`x-correlation-id`, accompanied by the existing Google runtime OIDC identity.
The API Worker retains the parent only after verifying the expected audience and
service account before the response is finalized; direct callers start with the
API's Cloudflare ray or a fresh UUID.
An externally supplied `x-request-id` never establishes that root. Identity
verification is shared with the existing privileged identity/IP checks.

Next uses only an already cached runtime identity for ordinary public calls. A cold
or expiring cache starts a shared background metadata lookup, bounded to two seconds,
without delaying the call. Tokens expire from the cache one minute early. The API
verifies the optional parent proof alongside the public operation, without awaiting
it; mandatory identity/IP authorization still awaits that same verification.
An unavailable or still pending proof preserves the public authentication outcome.
Roots are frozen when the response or diagnostic is finalized.
Next retains one unsampled `authentication.client.correlation_failed` event with
`outcome=degraded`, the authentication outcome and a bounded reason. When the call
also fails, those fields join its existing `.failed` event instead. The parent and
validated remote root are linked by the per-call `requestId`; privileged service
checks retain their authorization requirements.

Every internal HTTP call has a separate UUID `requestId`; several concurrent calls
can share one `correlationId` without losing their individual identity. W3C trace
and parent span IDs remain separate causal context, when available. Next request
errors read the root from the incoming headers even if React transforms the error.

Keep the durable command or receipt ID stable for retries of the same submission;
each HTTP attempt gets a new `requestId`. A command UUID does not identify an HTTP
attempt, and sharing it cannot replace trusted correlation propagation.

Events also contain normalized route, service/environment/release, status when
available, duration and the 5,000 ms client deadline. Failed flag evaluations
preserve a bounded category and provider HTTP status where available. Worker stage
timings distinguish `runtime_identity` and `handler`; the client measures `transport`,
including runtime body consumption and schema validation for operations it decodes.
A raw HTTP proxy returns the response at the headers boundary.

At the deadline, the Worker records the pending stage without aborting the operation,
retrying it or changing its response. `waitUntil` keeps this bounded diagnostic task
alive after client disconnection where the runtime permits. Later completion does not
emit a second failure. A process termination, provider outage or platform log limit
can still prevent evidence; no absolute delivery guarantee is claimed.

Only enumerated operational categories, normalized routes, validated identifiers and
controlled release labels enter events. Cookies, tokens, input, raw URLs, query values,
editorial content and exception messages do not. Error objects stay within the
application; telemetry sink failure cannot change authentication behavior.

The behavior change is unflagged: deterministic diagnostics preserve authentication
outcomes. The deployment setting below controls paid ingestion, independently of the
authentication release flag, so a flag-provider failure cannot disable its own evidence.

## Activation and cost

The application defaults additional emission to disabled. Approved production
activation is declared in [the web Worker's production environment](../../wrangler.web.jsonc)
and [the API Worker's production environment](../../apps/api-worker/wrangler.jsonc).
Authorization was given on 2026-10-08 (America/Sao_Paulo); the
[dated activation baseline](https://github.com/BetoFrega/macae-classificados/issues/1760#issuecomment-6071584590)
records the spending limit and review after the first day.
Qualification remains disabled by default. The API deploy entry point accepts an
explicit `AUTHENTICATION_DIAGNOSTICS_ENABLED=false` override for rollback; persist
deactivation in both production profiles before the next normal delivery.
The API deploy entry point sets provider head sampling to `1`
only with this activation; otherwise it retains `0.1`. Invocation logs remain disabled.
Application sampling, rather than provider head sampling, keeps successes at 10%.
Verify both settings after deployment. Version activation changes in both profiles
so subsequent deployments retain the approved mode.
Disabling the mode restores the prior Worker failure event and its original sampling.

Before activation, record observed request volume and error rate, bytes per event,
account-wide ingestion and remaining included allowance, both providers' retention
and pricing, an approved spending limit and a review condition. With `F` failures and
`S` other outcomes, the expected additional volume is approximately `F + 0.1*S`
events per instrumented boundary; caller/Worker coverage and existing logs affect
the actual total. Correlation-only losses add one unsampled event instead of a
sampled success; count these separately. Retries and existing library logs must be
accounted for separately.

Provider head sampling at 10% can discard failures and multiply success sampling to
approximately 1%. It does not satisfy this mode. An errors-only application sink
would reduce comparison evidence and requires revisiting the accepted success scope;
a new external exporter adds an operational dependency. Neither is silently selected.

Read current [Cloudflare log pricing and limits](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing)
and [Cloud Logging pricing](https://cloud.google.com/stackdriver/pricing#logging-costs)
at activation. Repository configuration does not establish actual provider retention,
plan, account usage or billing. Stop expansion at the approved cost/review condition;
retain an explicit diagnostic-coverage exception if reducing evidence is necessary.

## Authentication fan-out

Authorize a batch once and pass the verified caller to its item-level reads; adding
items must not add session lookups. Preserve the caller's role and ownership checks.

Each independent HTTP endpoint still authenticates its caller. A fixed set of
distinct logical reads is not item-proportional fan-out; count item-dependent
pre-reads separately from uploads and the final commit before choosing a correction.

During a React render, consumers must share the same request-scoped memoized session
reader to share an in-flight lookup. Ensure direct session reads use that shared
reader; a memoized wrapper deduplicates only its own consumers. `React.cache` covers React render passes;
Route Handlers and other execution contexts require an explicit caller or a separately
verified request scope. Keep authentication results out of cross-request caches, and
verify that subsequent requests observe session revocation and role changes.

Count distinct authentication `requestId` values per root `correlationId`, then inspect
individual spans of the matching trace. Failures are unsampled; successes are sampled
independently at each boundary, so observed success counts are lower bounds. Generic
`fetch` spans alone do not establish authentication volume. Distinguish the confirmed
application amplification from the location of the downstream bottleneck; a transport
timeout does not identify Worker overload, proxy blocking or memory exhaustion.

## Verification and investigation

1. Run the client unit collection and Worker runtime tests, including
   `apps/api-worker/tests/diagnostics.runtime.test.ts`. These prove shape, redaction,
   correlation, 5xx, expected closure and deadline behavior; they do not prove export.
2. Run login, newsroom access-control and operational-read E2E with the local
   authentication Worker, following [Test Harness Operation](test-harness-operation.md).
3. After authorized deployment, read back the exact Next/Worker releases, activation,
   provider head sampling and invocation-log settings. Use bounded credential-free
   probes. Inject dependency failures only through an explicitly authorized isolated
   qualification fixture; never add public fault switches to production.
4. Query Cloud Logging for `jsonPayload.event="authentication.client.failed"`, then
   find the matching Worker event by `correlationId`, then `requestId` or `traceId` in Cloudflare Workers
   Logs. Compare stages, duration, status and releases. Include `.completed` events
   when comparing success and `.correlation_failed` when the roots differ. A missing Worker event may mean the call never arrived,
   context/export was lost or retention/sampling intervened; it does not identify
   which condition occurred.
5. In PostHog, check individual spans and exact trace IDs as well as root traces.
   Record the UTC window, filters and sampling. Empty results are scoped observations,
   not proof of absence. Inspect only safe attributes.

Export acceptance requires querying the emitted failure evidence in the actual
providers, including a controlled timeout in the approved fixture, and confirming
that successes remain sampled. Record any failed readback and pending production
journey verification in the incident. Green synthetic probes do not establish a fix.
