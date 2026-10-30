# Authentication migration

Use this runbook for #1671. Product behavior belongs to
[account access](https://app.notion.com/p/3ff84301eab38138950cf38d73f46605) and
[email verification](https://app.notion.com/p/3ff84301eab381c09277c57aed13fe53); structural decisions belong to
[ADR 0041](../adr/0041-replace-firebase-auth-with-better-auth-in-the-first-backend-cut.md).
The repository maintainer owns qualification, release and recovery.

## Authority and compatibility

Next always authenticates through the API Worker; no code selects another provider.
`wrangler.web.jsonc` still declares `AUTHENTICATION_AUTHORITY=better-auth`, which
nothing reads. Outages close access; they never select Firebase.

Deploy Next and API artifacts from the same reviewed commit. They implement HTTP
protocol `1`, checked through `x-authentication-protocol`. An incompatible response
fails closed. Record the web Worker version ID, API Worker version ID, source commit, D1 ID,
migration set and public/API origins in the execution receipt. The Worker returns
its provider version ID in `x-authentication-release` when available. Before any
recovery, qualify the candidate pair against this same protocol and schema.

The Worker admits requests without reading `authentication_authority`. Production's
phase is `active`, and the D1 trigger `reject_authority_regression` keeps it there;
the phase only gates the account import in `apps/api-worker/migration.ts`. The Worker
reads no remote flag on the request path, and no remote switch closes access; close it
by fixing forward and redeploying the API Worker. API Worker versions released before
the Worker stopped reading the PostHog boolean flag `authentication-api`
([#2046](https://github.com/BetoFrega/macae-classificados/issues/2046)) fail closed
when it is off or deleted; keep it enabled in
[Flag 301464](https://eu.posthog.com/project/108331/feature_flags/301464) while a
rollback to them remains possible, then archive it.

## Provision and qualify

Production deployment, real migration, mail delivery and activation require
operational authorization. Until authorization is recorded in the ticket, use only
disposable local identities and D1.

1. Use `pnpm run test:worker apps/api-worker/tests/authentication.runtime.test.ts`
   for real local D1 transactions, identity preservation, concurrent recovery,
   cooldown finalization and runtime recovery.
2. Use the relevant Next journeys together under
   `E2E_REQUIRE_FRESH_SERVER=1 pnpm run test:e2e`; Better Auth is the test default.
   The supervisor owns the disposable Worker and native mail sink. Fixture
   configuration is private and ignored; its service token is accepted only with
   the test environment and loopback API.
3. For an authorized real qualification, create isolated D1 and Worker resources,
   apply the checked-in migrations and provision `BETTER_AUTH_SECRET` directly
   through approved tools. Never put its value in a receipt or chat. Configure
   `AUTHENTICATION_D1_ID`, `CLASSIFIEDS_D1_ID`, `AUTHENTICATION_API_ORIGIN`,
   `AUTHENTICATION_RUNTIME_ACCOUNT` and the qualification public origin before
   `pnpm --filter @tudomacae/api-worker run deploy qualification`.
   `EDITORIAL_D1_ID` is optional: without it the deploy drops `EDITORIAL_DB` and
   the Media routes answer 404 (`apps/api-worker/deploy.mjs`).
   `PUBLIC_ARTICLE_INDEX_SERVICE` is optional too: it names the index Worker bound as
   `ARTICLE_INDEX`; without it the binding is dropped.
4. Set the same API origin as the Google OIDC audience and the runtime
   service-account email (`AUTHENTICATION_RUNTIME_ACCOUNT`) as the caller. The Next
   frontend requires `AUTHENTICATION_API_URL` and `PUBLIC_APP_ORIGIN`; a web Worker
   reaches the API through its service binding instead of a Google identity token
   (`web-worker/outboundRouting.ts`). The service channel is read-only and creates no
   user session. No environment in `wrangler.web.jsonc` targets a qualification API
   Worker; add a route-free one before qualifying the frontend against it. Keep its
   invocation logs disabled, because callbacks carry private query parameters, and
   verify that setting in provider readback. Content and credential writes go through
   the qualification API Worker; Storage writes stay unavailable. Record every
   disposable resource before provisioning and remove it after qualification
   evidence is published; close qualification exposure first and verify deletion.
   Preserve production resources and the recovery artifacts needed for an
   authorized cut.
5. Verify actual email receipt, callbacks in both browser contexts, cookie/cache
   headers, refused origins, caller/audience forgery, disabled users and existing
   editorial PATs. Browser qualification disables automatic capture, replay and
   person profiles, exporting only bounded login/session failure events to the
   existing PostHog project with qualification environment and release context.
   For a disposable qualification, cap exports at 20 events, verify the permitted
   payload at the browser boundary and confirm bounded ingestion in the provider.
   Billing access is not a prerequisite for this bounded test. Verify retention and
   sustainable ingestion capacity before production exposure. Record counts, bounded
   outcomes and provider version IDs only.

Local proofs do not establish provider mail delivery, retention, alert usability or
production readiness. Obtain provider readback for those gates. Ordinary diagnostic
logs are sampled at the configured rate; aggregate provider metrics and the complete
qualification journeys supply availability evidence. Operational failure events use
bounded routes and request IDs, without email, token, payload or exception text.

## Production artifact preparation

After operational authorization, select a reviewed commit on `main` and use that
same immutable SHA for both artifacts. Before freezing or promoting Next:

1. The [production workflow](production-delivery.md) applies the API Worker's D1
   migrations and publishes it before promoting Next. Outside it, for example during a
   recovery, run the same steps with
   `AUTHENTICATION_D1_ID=<id> CLASSIFIEDS_D1_ID=<id> [EDITORIAL_D1_ID=<id>] AUTHENTICATION_API_ORIGIN=<api-origin> AUTHENTICATION_RUNTIME_ACCOUNT=<runtime-service-account> pnpm --filter @tudomacae/api-worker run deploy production --migrations-only`,
   then the same command without `--migrations-only`. Do not activate D1 during
   schema preparation.
2. Read back the API's active version at 100%, exact D1 bindings, runtime environment,
   service audience/account, mail sender, query redaction and disabled preview URLs.
   Production enforces Turnstile by default. While the serving Next does not yet send
   `x-turnstile-token`, publish with `TURNSTILE_ENFORCEMENT=off` (repository variable
   for the workflow) and remove it only after the Next that renders the widget is
   promoted; otherwise every login, registration and reset request answers `403`.
3. Build the Next candidate from that SHA through the candidate-only production
   workflow. Keep its account exposure closed until the freeze, reconciliation and
   global activation below pass. Record both provider versions before promotion.

Better Auth limits use atomic D1 counters shared across Worker instances. Login,
registration and reset requests retain the endpoint's limit per normalized account
address, independent of caller IP, plus a network limit of 100 requests in 10 seconds.
Other auth endpoints retain their default network limits. Keys are keyed hashes;
raw addresses and IPs are not stored. Direct requests use Cloudflare's connecting IP. Production Next forwards the edge's
client address with its runtime OIDC identity; the Worker validates the exact caller
and audience before choosing that address. Missing or malformed edge addresses close
production proxy calls, and forged forwarding assertions are refused. Proxied clients
therefore retain independent network buckets; accounts also have independent limits. Counters expire after the endpoint's window and expired rows
are removed in bounded batches during consumption. Verify parallel requests and
Worker recovery preserve the limit before activation.

Production login, registration and reset-request calls also require a Turnstile token
(widget `0x4AAAAAAFUPX0zOHT6VJ_1g`). Next forwards it as `x-turnstile-token`; the
Worker's `TURNSTILE_SECRET` verifies action and the `PUBLIC_APP_ORIGIN` hostname after
the attempt limit. `deploy.mjs` sets `TURNSTILE_ENFORCEMENT=on` for production and
`off` for qualification; an enforced Worker without the secret refuses those calls.
A missing secret or a siteverify that cannot answer emits an unsampled
`authentication.worker.failed` with `failureCategory: "dependency"` and
`dependencyFailure` (`configuration`, `network`, `timeout`, `http_status` or
`invalid_response`); bot refusals are ordinary sampled 403 completions.
In an emergency, redeploy with `TURNSTILE_ENFORCEMENT=off`; the Worker then ignores the
token, and forms whose widget cannot load submit without one. Confirm the binding with
`wrangler secret list --name tudo-macae-api-production`.

## Global cut

The Firebase Auth to D1 transfer completed on 2026-10-07 (#1671). Its export CLI and
the `frozen` runtime barrier no longer exist; recover only against the same active D1.

## Advance or recover

Advance only when every selected journey succeeds, identity reconciliation has zero
inconsistencies, writer count is one, and the first new-account/recovery/role/attempt
writes are preserved through recovery of the compatible artifact pair. Record the
baseline and observed counts; do not estimate success from low-volume percentages.

Recover on any identity/ownership mismatch, accepted stale role or disabled account,
recipient inconsistency, duplicated writer, or sustained failure of the selected
account operations. Close account exposure.
Restore a qualified Worker/Next pair against the **same active D1** and confirm newly
created accounts, password hashes, roles and attempts still work. Re-importing the
Firebase snapshot or sending traffic back to Firebase is not recovery. If restoring
D1 itself is necessary, verify the provider restore point and reconcile every later
write before reopening access; an unexplained write blocks recovery.

Expired native sessions/proofs remain private D1 records until operational cleanup.
Before production activation, qualify a bounded cleanup of expired `session`,
`verification`, `password_recovery` and `email_confirmation` rows against the actual
Better Auth schema and provider backup/retention policy. Keep active credentials,
verification cooldown and identity records. No cleanup job or real restore is
activated by this implementation.

## Consumer inventory

Verify remaining identity reads with:

```bash
rg -n '\bauth\.(getUser|getUsers|listUsers|setCustomUserClaims|revokeRefreshTokens|updateUser|verifySessionCookie)' src packages --glob '*.ts' --glob '!**/tests/**' --glob '!**/*.test.ts'
```

New authority composition covers Next sessions/account actions and administration;
editorial credential role validation and control; editor names, publication lifecycle,
media ingestion/history and source updates. The command above finds no Firebase Auth
reader. D1 behind the API Worker is the content and
editorial-credential store. #1438 keeps its account-entry/return contract
and remains open; #1437 search remains independent and public.
