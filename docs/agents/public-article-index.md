# Public article projection operation

The canonical source is the editorial D1 (see [Reconciliation](#reconciliation)). The projection stores discovery summaries, not article
bodies or publication grants. `packages/editorial-blog/articleDistribution.ts` owns the
seven-field summary and the distribution contract; `src/packages/editorial/publicArticleIndex.ts`
owns the order. The sitemap reads Article URLs directly from D1 at
`articleSitemapProduction.ts`, without a release-flag evaluation or Firestore fallback.
A Worker failure records `public_article_index_failure` and fails the sitemap request.
An authenticated Worker failure shares the read's bounded `correlationId`, propagated
as `x-request-id`. Restore service by repairing the dependency or rolling back the
application revision through [Production delivery](production-delivery.md#manual-recovery).
After release verification, archive `public-article-index-sitemap`; never reuse its key.
An older revision may still evaluate that flag, so inspect its behavior and the live
flag state before rollback.

## Runtime and Worker configuration

`PUBLIC_ARTICLE_INDEX_URL` must be the HTTPS origin of the index Worker, without a
path, query, credentials or fragment. Configure only the runtime identity verified
for release. Each mutation runtime needs an independent metadata identity probe
before its runtime is configured or its mutations are qualified; one runtime's probe
does not verify another. There is no static bearer credential. The Worker audience
is exactly its HTTPS origin.

The Worker requires the `DB` D1 binding, `OIDC_AUDIENCE` and
`OIDC_SERVICE_ACCOUNT` (the verified email of its permitted runtime account). If
mutation runtimes use different identities, verify and qualify their access separately
before release; a Worker accepts only its one explicitly configured account.

Workers reach the index through the `ArticleIndexWriter` entrypoint
(`apps/public-article-index/writer.ts`) instead of HTTP, because they cannot mint the
Google identity token. Only a Worker whose configuration binds that entrypoint can
call it, so the binding is the caller's identity. `publish` and `retire` apply the same
version and tombstone rules as the HTTP routes and answer `confirmed`, `stale` or
`invalid`; a storage failure logs `public_article_index_worker` with the caller's
`correlationId` and rejects. The API
Worker binds it as `ARTICLE_INDEX` only when its deploy sets `PUBLIC_ARTICLE_INDEX_SERVICE`
(`apps/api-worker/deploy.mjs`); without it, Blog saves stay `unconfirmed` for the index.
Verify with `npm run test --workspace=public-article-index-worker` and
`npx vitest run --config vitest.worker.config.mts apps/api-worker/tests/editorialBlogDistribution.runtime.test.ts`.

`apps/public-article-index/wrangler.jsonc` keeps local defaults and declares the
production D1 binding and permitted runtime identity under `env.production`.
Production commands require `--env production`. Apply both migrations and verify the deployed
Worker through [Production delivery](production-delivery.md) before configuring application runtimes. Read promotion belongs to the release
ticket; reconcile and verify every mutation runtime before promoting a read revision.

Publication, editing, taking off air, republication and publication-time changes
commit canonically before synchronizing the current stored article. The returned
`distribution` result distinguishes confirmation from uncertainty. The Newsroom retry
command authorizes an active Editor and synchronizes current canonical state; it does
not repeat the editorial mutation. A failed projection update is not queued or retried
on its own; the hourly [reconciliation](#reconciliation) repairs it. `public_article_index_failure` and `public_article_index_worker` record failures
without editorial payloads or credentials; mutation correlation is propagated as
`x-request-id` when available. Keep operational logs within the 30-day retention limit and verify provider retention;
repository configuration alone is not proof. Cloudflare native Workers Logs retains
logs for at most seven days. Disable invocation logs because their raw URLs are outside
the telemetry contract; retain the Worker's sanitized operational events.

Canonical Article transactions advance `updatedAt` to the greater of the host clock
and the stored value plus one millisecond. This orders projection writes even when
clocks repeat or move backwards, without changing the requested publication time.
D1 retains withdrawal versions so an older delayed upsert cannot resurrect an off-air
article. Equal versions prefer withdrawal; retries preserve the current canonical
version, while each later editorial mutation advances it.

## Reconciliation

The API Worker's hourly cron compares the index with the visible
editorial D1 articles and repairs each difference through the `ArticleIndexWriter`
binding, under the same version rules as a save, so a concurrent save is never undone.
Without that binding the run fails with `ArticleIndexUnbound`. Each run's event carries a
`correlationId` that the index Worker's `public_article_index_worker` events repeat for
its reads and writes.
A run with differences logs `public_article_index_reconciliation` with the outcome
(`repaired`, or `partial` when differences remain), the count and up to 50 article IDs
and field names.

## Local and E2E verification

`npm run test --workspace=public-article-index-worker` bundles the actual Worker and runs
its handlers against Miniflare's D1. Tests supply a generated signing key through the
JWKS network boundary; production always uses Google's JWKS and has no test-mode
bypass or configurable issuer/key endpoint.

The root consumer checks run with `npm run test:worker -- bin/articleIndexConsumer.runtime.test.ts`.
They exercise the build artifact over HTTP without importing Worker implementation.
`@tudomacae/article-index-test-runtime` is test infrastructure shared by runtime tests
and the E2E preload; its controlled build callback receives a temporary output directory.
`npm run build --workspace=public-article-index-worker` produces the Worker bundle and
ordered SQL migrations in `dist/`. The root preload uses that workspace command.

Worker runtime tests prove SQL and OIDC contracts. The E2E stack explicitly
preloads `bin/articleIndexTestPreload.mjs` into its server processes, connecting the
production HTTP client to the actual Worker bundle and disposable Miniflare D1.
Reads use that Worker; write requests receive a controlled HTTP 503 at the network
boundary so existing Newsroom journeys retain their warning and retry coverage.
Worker runtime tests separately prove successful writes and their D1 effects.
Generated test identities and keys enter only at the metadata and JWKS network
boundaries. The preload requires the test environment, a loopback `AUTHENTICATION_API_URL`
(the API Worker fixture) and the test Worker origin; production does not load it. Live identity, IAM and D1 parity remain
release evidence.

Editorial confirmation deliberately waits for the post-commit current-state read,
metadata identity acquisition (5-second timeout) and Worker response (10-second
timeout). During degradation this can add up to roughly 15 seconds plus the canonical
read, with unknown normal latency and concurrency impact. The synchronous confirmation
makes a failed distribution visible without the queue prohibited by the spec. Verify
mutation latency and timeout rates before release; a repeated distribution never
repeats the canonical write.
