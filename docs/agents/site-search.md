# Site search operation

The visitor searches from the header or `/busca?q=`; `packages/site-search`
owns the public contract (outcomes, deduplication, presentation) and hides the
provider. One list by relevance covers the public pages of Classificados and
Editorial; `tipo` narrows it:

| Result type | Glossary term | Label | Public route | `tipo` |
| --- | --- | --- | --- | --- |
| `business` | Negócio (Classifieds) | Negócio | `/negocio/<id>/<slug>` | `negocios` |
| `ad` | Anúncio (Classifieds) | Anúncio | `/anuncio/<id>/<slug>` (not `/editar`) | `anuncios` |
| `category` | Categoria (Classifieds) | Categoria | `/categoria/<id>/<slug>` | `navegacao` |
| `subcategory` | Subcategoria (Classifieds) | Subcategoria | `/categoria/<id>/<slug>/<id>/<slug>` | `navegacao` |
| `article` | Matéria (Editorial) | Notícia | `/noticia/<id>/<slug>` | `noticias` |
| `editorial-section` | Editoria (Editorial) | Editoria | `/editoria/<id>/<slug>` | `navegacao` |
| `topic` | Assunto (Editorial) | Assunto | `/assunto/<id>/<slug>` | `navegacao` |
| `page` | none: entry and institutional pages | Página | `/`, `/negocios`, `/noticias`, terms, privacy | `navegacao` |

Category and Subcategory titles are shown as the Classifieds path, such as
"Restaurantes › Padarias".

The product decision for the editorial filter name lives in
[Encontrar matérias](https://app.notion.com/p/3f684301eab3810e9a9bed3d968d32cb?pvs=204).
The table above maps result types and labels; it does not supersede the accepted
filter decision or certify that its presentation has been deployed.

Any other address the crawler reaches is never presented. Each public route declares
its type in `<meta name="search_result_type">` (`siteSearchResultTypeMeta`), which the
index extracts as a custom metadata field. A filtered search asks the provider for
those types; when that answer has no presentable page (pages indexed before they
declared a type), it repeats the search unfiltered and filters in the app. There is no own
synchronization, visibility check or ranking: the index refreshes at its native pace
and a result may briefly point to a page already withdrawn.

## Release flag

| Field | Value |
| --- | --- |
| Key | `site-search` (PostHog, evaluation runtime `all`: the server request is not a recognised SDK, and PostHog omits `server`-only flags for it) |
| Owner | Repository maintainer |
| Purpose | Validate site search with Cloudflare AI Search before public audience |
| Initial audience | The maintainer, by a release condition on their identified `distinct_id` (account `uid`), and `localhost` hosts for local testing |
| Current audience | Everyone since 2026-09-28, by a third release condition with no properties at 100% |
| Success signals | `site_search` outcomes mostly `results`/`empty`; known names among first results; `site_search_result_clicked` |
| Rollback signals | Sustained `timeout`/`unavailable`/`provider-error`/`quota`, or irrelevant results |
| Removal | When the product owner approves: remove the flag and the losing branch after full adoption or abandonment |

`src/proxy.ts` resolves the decision before rendering `/busca` (off → 404) and the
header resolves it once per request. Identified browsers are evaluated by the
`distinct_id` in the PostHog persistence cookie; everyone else shares
`site-search-public`. Decisions are reused for 30 seconds per audience (at most 500
remembered). Missing configuration, PostHog failures, non-boolean and absent
decisions keep the established experience. The flag is a release control, not an
authorization boundary.

Anonymous visitors share one audience, so a percentage below 100% enables or disables
all of them together; only identified people split by percentage. Expand, roll back
and verify through the PostHog flag, without a deploy:

- **Expand, or restore after a partial rollback:** keep the maintainer and
  `localhost` conditions and add a condition with no properties at 100%.
- **Restore after a full rollback:** enable the flag again, then confirm the
  100% condition is present.
- **Partial rollback:** remove that condition; the maintainer and `localhost` keep the
  search for diagnosis.
- **Full rollback:** disable the flag.
- **Verify:** after the 30-second decision reuse, an anonymous
  `curl -o /dev/null -w '%{http_code}' https://www.tudomacae.com.br/busca?q=padaria`
  answers `200` when enabled and `404` when disabled.

## Runtime configuration

| Variable | Where | Value |
| --- | --- | --- |
| `SITE_SEARCH_URL` | Web Worker runtime (`wrangler.web.jsonc`) | HTTPS origin of the search Worker, no path |
| `SITE_SEARCH_FLAGS_ORIGIN`, `SITE_SEARCH_FLAGS_TOKEN` | Local stacks only | Override the PostHog origin/token used for evaluation |

Deployed runtimes evaluate against `NEXT_PUBLIC_POSTHOG_HOST` with
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`. HTTPS is required; an `http` loopback origin
is accepted for a local provider and receives no runtime identity. Without
`SITE_SEARCH_URL` every search reports `unavailable`.

## Worker and index

`apps/site-search` receives `POST /search` `{ "query": "…" }` authenticated with a
Google-signed identity of `OIDC_SERVICE_ACCOUNT` for audience `OIDC_AUDIENCE`, the
same scheme as [the public article index](public-article-index.md). It calls the
`AI_SEARCH` instance binding with hybrid retrieval, `return_on_failure: false`, and
no query rewriting, reranking or generation, and answers `{ chunks, durationMs }`,
`429` for an exhausted allowance or `502` for other provider failures. The app
applies one 15-second deadline to identity, the search and its unfiltered retry
(`timeout`) and maps `503`/network failures to `unavailable`.

Intended AI Search instance `tudo-macae-site-search` (default namespace):

- website source `www.tudomacae.com.br`, discover parsing from sitemaps and links
  (Assuntos and institutional pages are not in the sitemap), no subdomains or
  external links;
- exclude `**/admin**`, `**/minha-conta**`, `**/redacao**`, `**/publicar**`,
  `**/busca**`, `**/midia**`, `**/api/**`, `**/*/editar`, `**/anunciante/**`;
- rendered pages (`use_browser_rendering: true`), no images;
- custom metadata `title`, `description` (Open Graph) and `search_result_type`
  (text), added after the routes declaring it are deployed so the reindex reads it;
- vector + keyword index with `rrf` fusion, no rewrite, no reranking, public
  endpoint disabled.

At about 460 sitemap URLs plus discovered pages, the first sync can exceed the
Workers Free allowance of 500 crawled pages per day and finish over more than one
day.

The binding requires the AI Search instance to exist. Normal Worker publication
follows [Production delivery](production-delivery.md), which reads the active
version back after publishing the tested `main` SHA.

`wrangler.web.jsonc` points `SITE_SEARCH_URL` at
`https://tudo-macae-site-search.frega.workers.dev` and binds `SITE_SEARCH`, which
carries calls to that origin (`web-worker/outboundBindings.ts`). As of 2026-09-27 the instance
exists with the configuration above (read back through the API), its first sync was
running without errors, and the deployed Worker answers 401 without a runtime
identity (`curl -X POST <origin>/search`).

The crawler stores a page's first chunk with YAML front matter; presentation uses
its `description` as the snippet and drops the streamed `Carregando...` fallback.

## Telemetry

- Server: one `site_search` log per answered search with `outcome`, `filter`, `resultCount`,
  `durationMs` (app → Worker round trip), `providerDurationMs` (AI Search call),
  `service`, `environment`, `release`, `flag` and the Cloud trace. Failures are
  `ERROR` (`WARNING` for `quota`); `empty` is `INFO`. Flag evaluation failures log
  `site_search_flag` once per 30-second window and audience.
- Worker: `site_search_worker` with outcome, status class, chunk count, latency,
  release and propagated `correlationId`; invocation logs stay disabled.
- Browser (PostHog): `site_search_submitted` (`source_surface`),
  `site_search_completed` (`outcome`, `result_count`, `type_filter`) and
  `site_search_result_clicked` (`position`, `result_type`, `type_filter`).
- Never recorded by the application: query, snippets, titles, result URLs or their
  hashes. `q` is removed from `/busca` URLs in events and in replay page/network
  URLs; the forms and results carry `ph-no-capture`, and the page title is fixed.
- The shareable URL carries `q`, which platform request logs see before any
  application code runs:
  - `apps/www-origin/wrangler.jsonc` disables invocation logs;
  - the `_Default` sink of `macaetem-dev` excludes Cloud Run request logs of
    `/busca` (exclusion `site-search-query-urls`, applied 2026-09-27; remove with
    `gcloud logging sinks update _Default --project=macaetem-dev --remove-exclusions=site-search-query-urls`);
    the `site_search` log keeps outcomes and latency;
  - `/busca` and `/negocios` set `referrer: origin`, so result clicks send no query
    onward;
  - the same sink also excludes Cloud Run request logs of `/negocios?` (exclusion
    `negocios-query-urls`, applied 2026-10-10 by the product owner and confirmed by
    them 2026-10-14; remove with
    `gcloud logging sinks update _Default --project=macaetem-dev --remove-exclusions=negocios-query-urls`).

Alerts and dashboards (outcome rates, latency percentiles, quota refusals, index
job health) still need their query, window, minimum volume and threshold (#1378).
The product owner activated the public audience on 2026-09-28 before they exist;
until then, detect the rollback signals by reading `site_search` and
`site_search_worker` logs.

## Local and E2E verification

Unit tests cover the contract, flag and adapters through the package entry points;
`npm run test:worker -- apps/site-search` covers the Worker. The E2E stack serves
`tests/e2e/bin/siteSearchFake.ts` as a loopback PostHog `/flags` and Worker: only
`e2e-site-search-maintainer` is enabled, `e2e-site-search-flag-failure` gets a
500, and specs script replies per query. CI never depends on the external ranking.

## Release gate

These checks gate any audience beyond the maintainer. All passed before public
activation on 2026-09-28; the evidence is in #1377. Repeat them after replacing the
provider, the index or the Worker transport.

- The `www-origin` deploy reads back with invocation logs disabled.
- AI Search, Workers AI and Browser Run consumption stays within the approved spending
  review; the account is on Workers Paid.
- A sync completes without errors and every result type carries `search_result_type`.
  The crawler reuses cached pages for up to `max_age`, so pages crawled before a
  metadata change keep the old metadata until that age expires.
- A search from the web Worker through its `SITE_SEARCH` binding reaches AI Search, and
  `site_search_worker` carries the caller's `x-request-id` as `correlationId`.
- Representative queries against the real index: known names and titles appear among
  the first results, intents ("conserto de celular", "obras no trânsito") return
  pertinent pages, and each `tipo` filter returns its type.
- Automated responsive, keyboard and accessible-name checks of the header entry,
  form, results, empty and failure states, per the journey matrix in
  `ACCESSIBILITY.md`.
- Queryable export of `site_search`/`site_search_worker` logs and PostHog events,
  sanitization and correlation, plus replay masking read back from PostHog.

Provider notes: creating a `web-crawler` instance with sitemap parsing and
`include_items` returned `7001 Internal Error`; the discover configuration above
succeeded, and browser rendering is enabled (2026-09-27).

Alerts and the dashboard were not part of this gate; see Observability.
