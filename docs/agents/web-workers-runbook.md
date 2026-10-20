# Web application on Workers

[Spec #1406](https://github.com/BetoFrega/macae-classificados/issues/1406) defines the
boundary: one application build/deployment, the vinext build of the root app in the
`tudo-macae-terms-workers` Worker (ADR 0046; `apps/web-workers` is its Terms-only
predecessor). `apps/www-origin` sends every `www` request to it through the
`WEB_WORKER` binding ([router runbook](www-origin-runbook.md)); no journey flag or
second origin remains. Specialized Workers retain independent lifecycles.

Every method reaches the application, Server Actions of either build included; a
Next `next-action` id the vinext build cannot resolve fails there. Never retry
ambiguous writes. Migration preserves data authority.

## vinext build

ADR 0046 ([#2187](https://github.com/BetoFrega/macae-classificados/pull/2187)) builds
`src/app` with vinext (`vite.vinext.config.ts`, `wrangler.web.jsonc`).

### Published compatibility contracts

Retain `tudo-macae-terms-workers`, `/_terms-workers`, `x-www-origin: terms-workers`,
`x-terms-worker-version` and failure/version telemetry names. These name the service, not route restrictions.
New internals use `WEB_WORKER` and `WORKERS_*`.
Physical recreation needs bootstrap/grants; namespace/diagnostic changes need an
explicit compatibility transition. `webAssets.ts` owns namespace/manifest paths.

## Build assets

Build assets use `/_terms-workers/<release-sha>/_next/static/`. Before replacement,
copy the previous release's assets from `/_terms-workers/assets-v1.json` with checksum
verification; older releases are dropped, so a page open across two deploys can fail to
load chunks. Missing manifest/assets block deployment. Assets are version-bound:
[Cloudflare deployments](https://developers.cloudflare.com/workers/versions-and-deployments/).

## Migration gotchas

### Migration gotcha: shared components need their CSS sources

Each renderer scans Tailwind independently. Include shared interactive dependencies
with `@source` in the Workers stylesheet; missing positioning/state classes can hide
functional Radix menus/sheets. Inspect emitted CSS and open controls at desktop/mobile
widths; server rendering or closed-state screenshots cannot verify popup visibility.

### Migration gotcha: font caches contain absolute application paths

Moving ignored `.vinext/fonts/**/style.css` caches leaves old absolute paths despite
successful builds. Preserve old cache outside the build, regenerate at the new root
and bypass build cache for first verification. Fresh CI has no such cache. Stop preview
before rebuilding; verify hydration and actual font responses from the stable build.

### Migration gotcha: document styles are inherited by shared components

Shared SiteDocument owns language, font variables and antialiasing; runtime providers
stay in app layouts. Compare inherited font family/size/weight/line-height/color/alignment/
smoothing at both widths. Run `tests/e2e/legal/terms-navigation.spec.ts` against the
built `vite preview`. Production fonts must return local 200s without
Google Fonts requests; verify vinext-generated self-hosted assets on upgrades.

## Production operation and recovery

### First production Worker bootstrap

Creating a Worker requires [product-level Admin](https://developers.cloudflare.com/workers/authorization/workers/);
existing-Worker Editor cannot create or scope grants before existence. A creation-authorized operator uses reviewed SHA:

```sh
CLOUDFLARE_ENV=production WEB_ASSET_RELEASE="$(git rev-parse HEAD)" npx vite build --config vite.vinext.config.ts --logLevel warn
RELEASE_SHA="$(git rev-parse HEAD)" CLOUDFLARE_ENV=production node bin/retain-web-assets.mjs --bootstrap
npx wrangler deploy --config dist/server/wrangler.json --tag "$(git rev-parse HEAD)" --var "SOURCE_SHA:$(git rev-parse HEAD)"
```

Read back active version and unchanged zone routes. Grant CI Editor on the new Worker,
preserving three existing grants and D1/zone permissions. CI verifies existence/access
before delivery and reuses the tagged bootstrap version without fetching an unserved
manifest. Use `$wizard` if credential transfer cannot avoid agent disclosure.
Bootstrap is route-free.

Protected delivery publishes application before edge with `WEB_WORKER` and reads back
both versions without an application route. Run `npm run probe:edge`.

### Recovery

The router has no fallback: an application `5xx` or binding failure reaches the
visitor (`terms-worker-unavailable` in the
[router signals](www-origin-runbook.md#observability)). Recover by redeploying a
fixed `main` or by `wrangler rollback` of the application to a version no older than
its `DataCache` Durable Object, as [Production delivery](production-delivery.md#manual-recovery)
describes. Run the bundled router regression with
`npm run test:worker -- apps/www-origin/index.runtime.test.ts`.
