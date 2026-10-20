# Observability

## Outcome and scope

A maintainer must be able to detect user-visible failure, determine the affected scope,
follow an operation across relevant boundaries and identify the owning component
without first adding instrumentation.

This baseline covers:

- the Next.js application on the web Worker;
- the API Worker and the Cloudflare data and image services it owns;
- the Cloudflare edge and public-image Worker;
- browser behavior reported through PostHog;
- HTTP APIs, MCP routes and their controlled boundaries;
- deployment, production verification, probes and operational automation.

Critical journeys include public discovery of news, classifieds, businesses, ads and
media; authentication and account management; publication and editing; Administration
and Newsroom work; MCP operations; and public-image delivery.

Build-only behavior is in scope only when its result affects delivery or production
verification. Provider control planes remain external dependencies; repository
documentation must not claim state that has not been read back from them.

The required detectable outcomes are:

- user-visible unavailability and unexpected errors;
- unexpected authentication or authorization failures;
- lost, duplicated or uncertain mutations;
- degraded media, caching or image transformation;
- material dependency failure or latency;
- broken MCP, deployment or public contracts;
- material changes in critical conversion outcomes when traffic is sufficient.

## Signals and correlation

Every signal must answer a named operational question.

- Use structured logs for discrete failures and operational events.
- Use metrics for rates, latency, availability, outcomes and degradation.
- Use PostHog for product behavior and browser exceptions, not as the sole source of
  server health.
- Use traces where causality across a real boundary is necessary. Adopt tracing
  incrementally; complete OpenTelemetry coverage is not a prerequisite.
- Keep domain audit records distinct from operational telemetry.

Operational events use stable names and include `service`, `environment`, `release`
and `outcome`. Add the available normalized route, status class and request, trace,
operation or execution identifier.

Use:

- request or trace IDs for HTTP work;
- `correlationId` and idempotency keys for mutations;
- execution identifiers for deployments, probes and automation;
- propagated context across MCP, Worker/origin and other controlled boundaries.

Record an unexpected failure once at the boundary that owns the response. Preserve its
cause and correlation without repeating the same error at every layer. Expected domain
outcomes are structured outcomes, not operational errors.

Route templates are permitted. Raw paths, query strings and payloads are not.

When changing server-side session reads, diagnosing an authentication dependency or
activating correlated signals, follow
[Authentication Diagnostics](docs/agents/authentication-diagnostics.md).

### Editorial machine operations

MCP operational metrics identify tool, latency, outcome, conflict, rate-limit response
and HTTP status without content. Preserve EditorialClient correlation in restricted
operational events, rather than as an unbounded metric dimension.

Detect authentication bursts, internal failures, attempts to reach human-only
operations, abnormal read volume and repeated submission conflicts. Alert thresholds
and responses follow [Alerts, ownership and response](#alerts-ownership-and-response).

## Data safety and retention

Never send credentials, authorization values, cookies, tokens, raw request or action
payloads, editorial content, free text, complete URLs, query values or exception
messages to telemetry.

The account `uid` is the approved stable user identifier when a named investigation or
journey requires user correlation. Treat it as pseudonymous personal data. Raw email,
name and other direct personal identifiers are prohibited. Entity identifiers may
appear only when required by a named operational question and must not become metric
dimensions.

Hashing does not make unrestricted personal or user-controlled data safe.

Editorial Activity is a domain accountability record; its
[product contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a)
owns its retention rule. Telemetry retention limits are:

- 30 days for operational logs;
- analytics retention follows the approved shared rule in
  [Tudo Macaé](https://app.notion.com/p/3f684301eab381fdb618ca7626c9f609?pvs=204),
  under “Regras compartilhadas de conta e privacidade”.

Session replay requires masked inputs and exclusion of credential, sensitive account
and other private surfaces. Provider configuration must be read back before claiming
that retention or masking conforms to this baseline.

Apply redaction at ingestion boundaries. Propagated context is data crossing trust
boundaries and follows the same restrictions.

## PostHog identity

Event capture uses a real visitor identity — the browser's anonymous ID or the
account `uid`. Invented constants, service names and entity keys merge unrelated
callers into one person. The `local/no-fixed-posthog-distinct-id` rule rejects them.

Global release controls have no visitor. The shared flag reader uses a stable,
non-empty evaluation identity per runtime environment, exclusively for `/flags`;
never reuse it for event capture, identification or person updates. Environment
targeting uses server-owned `person_properties`, not request input. Percentage
rollouts for visitors still require their real identity.

An empty evaluation identity can bypass a 0% condition: observed on 2026-10-06
with `POST https://eu.i.posthog.com/flags?v=2`, environment=production, 0% rollout
and `distinct_id: ""` returning `condition_match`/true. A non-empty identity returned
`out_of_rollout_bound`/false. Verify the effective decisions for every environment
before activation; the saved flag definition alone is insufficient.

Events are anonymous by default. Identified events cost about four times as much,
so identify a person or attach person properties only when a named analysis needs
per-person correlation, and record that need next to the call.

## Volume, cardinality and cost

Metric dimensions are limited to bounded values such as service, environment, release,
normalized route, outcome and status class. User IDs, entity IDs, URLs and free text
must not be metric dimensions.

Preserve aggregate visibility into critical failures and mutations. Diagnostic success
events, traces and other high-volume signals may be sampled. The public-image Worker
keeps its current `head_sampling_rate` of `0.1` for detailed telemetry; provider
aggregate metrics or probes must supply health evidence that head sampling cannot
guarantee.

Bound event size and temporary verbosity. Every verbose mode needs an explicit
activation path and bounded duration.

This baseline does not freeze observability spending. Before enabling a change that
increases cost, record:

- the operational benefit;
- expected ingestion, retention and monetary cost;
- lower-cost alternatives;
- a spending limit or review condition.

Obtain explicit approval before activation. Without approval, use a documented
compensating control or exception rather than silently dropping a critical
requirement.

## Alerts, ownership and response

The repository maintainer owns operational response on a best-effort basis. This
baseline establishes no 24×7 on-call promise.

Notify the maintainer for:

- failed deployment or production verification after its defined retry;
- confirmed security or data-integrity incidents;
- unresolved operation recovery, under the
  [product recovery contract](https://app.notion.com/p/3ff84301eab38193945cd2ec7c748e70);
- repeatedly failing probes;
- sustained operational-error bursts.

Each rate-based alert defines its query, window, minimum event count and threshold so
low traffic cannot produce a misleading percentage alert.

Create or update a GitHub issue for drift and non-urgent degradation. Keep latency,
cache, usage and conversion trends dashboard-only until they cross an approved
actionable threshold. Link a runbook when the response is not obvious.

Alerts, retention and ingestion follow the cost-approval rule above.

## Verification

New or changed instrumentation verifies:

- stable event shape and required context;
- sanitization and prohibited-data boundaries;
- correlation across affected boundaries;
- expected and unexpected outcomes;
- exported usability when local assertions cannot prove provider behavior.

Use the repository's proportional test selection. Relevant seams include unit and
integration tests, Playwright detection of 5xx responses, Worker runtime tests,
production edge and image probes, and exact-revision deployment verification.

A log statement alone does not prove that exported telemetry can be queried or used.
Inspect the provider dashboard when export, retention, masking or alert behavior cannot
be verified locally. A paid verification tool may be proposed through the cost-approval
rule; it is not implicitly authorized or permanently prohibited.

## Exceptions

An exception records:

- the unmet requirement and affected journey;
- owner and rationale;
- affected users or operational risk;
- compensating control;
- associated GitHub issue;
- review or expiry date no more than 90 days away.

Privacy, credential-safety and data-integrity exceptions cannot be permanent.

## Known setup gaps

As verified on 2026-10-04 (`rg -n 'identify|currentUser.email' packages/authentication/lib/ui/AuthContext.tsx`):

- `packages/authentication/lib/ui/AuthContext.tsx` preserves the existing raw-email
  PostHog identification, contrary to this baseline, and identifies every signed-in
  user without a recorded analysis need;
- provider-side retention and session-replay masking cannot be confirmed from the
  repository alone.

These gaps require separate authorized work; the workspace extraction preserves
runtime behavior.
