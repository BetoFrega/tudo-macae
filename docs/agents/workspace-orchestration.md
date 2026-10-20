# Workspace orchestration

npm installs dependencies; Turborepo schedules and caches tasks. Each workspace
declares its runtime/tool dependencies and scripts. Import through declared npm
exports, never source aliases. Source TypeScript is compiled by consumers.
Package tests use public entries; adapter tests belong with their composition.

## Selection, caching and verification

```sh
npm ci
npx turbo run build typecheck test --dry=json
npx turbo run build --graph=task-graph.html
RELEASE_SHA=$(git rev-parse HEAD) npx turbo run build --filter=web-workers-app
npx turbo run typecheck test build --filter=www-origin-worker
TURBO_SCM_BASE=origin/main TURBO_SCM_HEAD=HEAD npx turbo run typecheck test build --affected --filter='!//'
```

PR selection requires Git history and excludes root Next tasks and E2E: independent
application checks own their fixture/build lifecycle. Preserve
`futureFlags.affectedUsingTaskInputs`; it selects consumers of legacy/shared inputs
outside their workspace. `bin/workspaceOrchestration.test.ts` checks real Git/Turbo
selection for modules, apps, shared UI, legacy/configuration changes and asset hashes.

The root Next app conservatively selects and invalidates all workspaces when its
shared dependencies change. Keep this unmeasured cost until root extraction; then
restrict selection to actual consumers. Legacy-only changes select root and E2E;
isolated app changes select their owner and declared E2E consumers. Preserve
transitional inputs while their consumers remain legacy. No speed gain is established.

`build` compiles locally; Worker builds use Wrangler dry-runs. Root build/typecheck/test,
E2E, provider integration, deploy and remote maintenance remain uncached.
Delivery sourcemap uploads, asset retention,
publication and version readback stay outside cacheable tasks. Build identity includes
`RELEASE_SHA`, `CLOUDFLARE_ENV` and `VITE_*`; CI uses the candidate SHA. Outputs include
`dist/` and Wrangler's deployment pointer. Keep `.turbo/cache` local to each worktree.
The only remote cache is quality-flare's Container tests (`turboCache` in
`quality-flare.json`): an R2 cache for this repository's runs alone, which the daily
full run on `main` bypasses (`TURBO_FORCE`) while still refilling it. Its `cache` paths
(ESLint's cache and `tsconfig.tsbuildinfo`) are kept the same way, per lockfile.

For affected workspaces, run declared typecheck/test/build tasks,
`npm run lint:boundaries` and
`npm run test:unit -- bin/workspaceOrchestration.test.ts`. Select relevant browser journeys through
[Test Selection](test-selection.md), including indirect consumers of shared image preprocessing/controls.
Validate refactors without destructive cleanup or production probes. Deploy remains
separate and requires production authorization; use
[Production delivery](production-delivery.md).

`lint:boundaries` rejects private entries, cycles, undeclared dependencies,
package-to-app/app-to-app imports and transitive infrastructure in protected seams.
Workspace apps cannot reach legacy app code. Shared React imports no Next; foundations
import neither React nor Next. Explicit comparison bases are for local review; CI
retains PR-base protection.

## Shared web interface

`design-foundations` owns reset, themes, tokens and SVG brand. Its stylesheet uses
`source(none)`; each app scans its own sources and shared physical `lib` directories,
since Tailwind does not scan them through npm symlinks. Declared dependencies propagate
Turbo edges/hashes. Web app and Terms need no extra-workspace inputs.

`react-primitives` owns Button, NavigationMenu and Sheet; `site-layout` owns document,
header/footer, account entry and public navigation. These modules contain no app
contexts, loaders or Server Actions. Apps inject fonts, brand, links and pathname.
Next uses next/link, with pathname reads inside existing header Suspense boundaries
for prerendering; Cloudflare uses document anchors for destination ownership.
Auth, loading, navigation fetch/fallback logs and image/font adapters remain in apps.

Root button/navigation-menu/sheet shims only reexport shared controls; remove each
when callers use npm entries. No persistence adapter accompanies this extraction.

## E2E workspace

`tests/e2e` owns `@tudomacae/e2e`: Playwright, configurations, collections, browser
fixtures/snapshots, HTTPS and the application-stack supervisor. Root `test:e2e*` and
`test:harness` forward filters/arguments; root configs and launchers remain adapters.
The launcher accepts both legacy `tests/<journey>` and `tests/e2e/<journey>` paths.

```sh
npm run test:e2e -- tests/e2e/ads/create-new-ad.spec.ts --project=chromium
npm run test:e2e --workspace=@tudomacae/e2e -- --list
npx turbo run test:e2e:full --filter=@tudomacae/e2e
```

Declare app/package dependencies for selection. Executable E2E tasks have no build
dependency: the supervisor owns one build/infrastructure lifecycle. Production code
never depends on E2E. Until Next extraction, `tests/e2e/bin/e2e-stack.mjs` starts the
API Worker fixture, builds Next, and starts
`bin/start-app.mjs` from root. Preserve its root source/assets/tooling/Worker/config
inputs, domain fixture seams and root `@/*` mapping until their owning extraction.

Shared ports, environment, process groups, sanitized logs and LFS preparation stay
in `bin/`. PNG/server account helpers stay in `tests/_helpers` for unit/integration
consumers; browser sessions stay in E2E. Introduce no helper package. Reports/traces
live under `tests/e2e/{playwright-report,test-results}`; server logs use
`.next/e2e-server.log`.

## Composition exceptions

Domain factories receive adapters without initializing SDKs or requiring credentials.
Next actions, authorization, cache invalidation, request loading, navigation and
telemetry remain in the application. Root and E2E declare their real module
dependencies; protected replacements retain every existing operation/probe through
`domain-seams.json`. Scan workspace UI explicitly with Tailwind.

- **WWW origin:** `apps/www-origin` composes
  `createWwwOriginRouter(adapters).fetch(request)` from
  `@tudomacae/www-origin-routing/*`. Matching, canaries, qualification and recovery
  stay private. `readFlag(key)` returns a global decision or rejects; routing owns
  selection/failure classification. App adapters own PostHog/cache and Analytics
  Engine. `webAssets` defines build/retention. Node 24 operational scripts load
  standalone `contract`.
- **Article index:** `apps/public-article-index` bundles Worker and SQL migrations.
  E2E preload consumes it over HTTP. The app and `tests/e2e` declare
  `article-index-test-runtime` as test tooling, with no editorial rules. Runtime
  tests use the app's Vitest config; implementation, SQL and Wrangler config remain
  task inputs. Release requires D1 preflight.
- **Public images:** `apps/public-images` composes
  `@tudomacae/public-image-delivery/*`: presets, URL/cache identity, editorial
  fallback and purge. Ad/Profile variants come from the Classifieds Worker; only
  editorial images use `cf.image` and a bounded uncached HEAD on cold reads. Retain
  tags, generation and negotiation. `src/integrations/public-images` owns the Next
  image components and the Cloudflare purge adapter. Miniflare tests exercise
  bundled HTTP; favicon fixture is an explicit input. Separate deployment, health/revocation probes and
  [canary recovery](public-image-canary.md) remain required; build/refactor does not qualify production revocation.
- **Site search:** `apps/site-search` and release use the same production Wrangler
  config. Tests cover HTTP, Google OIDC and bundled Miniflare using local keys without
  production credentials/AI calls. `/search`, `/flag`, `/providers` remain independent
  of React `/ui`. Provider injects links/bounded capture; document anchors work alone.
  Next/PostHog/environment/Google identity/logs compose in `src/integrations/site-search`;
  retain query/filter, retry, ordering and HTTP contracts. E2E declares module and Worker.
- **Media:** `@tudomacae/media` owns rules/factories/UI; `/figure` is server-compatible,
  `/ui` injects images/navigation/operations/bounded telemetry. App composition lives
  in `src/integrations/media`; the API Worker persists Media in the editorial D1.
  `media-files` shares Sharp inspection/sanitization with editorial clients;
  `/fileInspectionProduction` initializes no persistence client; `civil-time` owns
  São Paulo conversion.
- **Ads:** rules expose focused factories/values/cleanup contracts, importing no
  Next, persistence or app-private types. Consume text-normalization and public-image
  contracts. App composition supplies transactions, Storage, live categories, time
  and failures. Advertiser identities consume ads image-path/lease/cleanup exports;
  ads depends on neither categories nor advertiser identities. Retain legacy
  identity/transaction selection inputs.
- **Authentication:** provider-free rules/UI cover sessions/cookies/synchronization,
  login/registration/recovery, verification and roles. `/claims` preserves other
  claims and requests session revocation on role removal. The API Worker client,
  HTTP and Next cookies compose in `src/integrations/authentication`. Account reminders,
  owned-publication/ad continuations, contextual messages and destination labels stay
  in root account composition through existing Classifieds interfaces. UID authorizes.
- **Categories:** Category owns maintenance/default seeds. App injects functional
  UI operations and Ads catalog. Ads/identities do not depend on categories.
### Editorial authority, credentials and Activity

Rules own callers, Editor/live roles, PAT profiles/
legacy scopes, issuance, sessions, clients and Activity validation. Inject cursor
codec; retain SHA-256/base64url compatibility without Node in rules/browser.
Persistence adapters own storage and cryptography, writing Activity inside caller transactions;
history stays capability-owned. Credential ownership uses transaction reads.
Preserve session parents, limits, expiry, revocation, cleanup and collections;
extraction performs no credential cutover. `/activityUI` injects links. Integration
inputs retain Editorial fixtures and Authentication composition until extraction.

### Editorial Sources and Captures

Inject persistence, live roles, time and cursor decoding;
revision/conflict/invalidation use transaction-read values. Persistence preserves
records, canonical URLs, immutable Captures, history, Activity and cursor wire
format. Focused records serve Story/Article adapters and Planning; Articles remain
legacy. Next injects invalidation refresh. Integration retains legacy Editorial fixtures.

### Editorial Planning

Rules own Stories/Topics, priority, Capture association, live Sections
and Topic navigation. Inject verified callers, adapters and cursors; policies use
transaction-read values. `/queueUI` and `/navigationUI` inject links. Persistence
preserves records, receipts, identities, conflicts and Activity. App composition
injects legacy Article/Submission readers; workspaces never import them. Retain
transitional Editorial integration fixtures. No planning board is implemented.
