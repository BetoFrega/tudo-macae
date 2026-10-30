---
trigger: when_operating_production_delivery_configuration
---

# Production delivery operations

This branch owns state that exists only in provider control planes and the path toward
versioned infrastructure. Load the [delivery contract](production-topology.md) when an
operation depends on request-path ownership, and [the crawling branch](production-crawling.md)
for managed `robots.txt` behavior.

## Control boundary

The repository versions the production probe and its contracts. It does not currently
version the Cloudflare zone, so repository code cannot truthfully claim to apply its
rules. Treat edge changes as proposals unless the user explicitly authorizes a production
operation.

The machine-specific rollout follows the [MCP edge runbook](mcp-edge-runbook.md).
Its evidence ledger is the only place that may claim whether the MCP hostname,
cache/WAF configuration and alerts have actually been applied.

The [apex redirect runbook](apex-redirect-runbook.md) owns its applied Single
Redirect, provider location, authorized activation, public verification and rollback.

## Dashboard-only state

These settings affect production but cannot be derived completely from this repository:

| Provider | State requiring control-plane access |
|---|---|
| Cloudflare | Origin address and SSL mode; full DNS inventory; redirect, cache and transform rules; WAF and bot settings; managed `robots.txt` / Content Signals state |

Close a gap by reading the relevant dashboard or API and recording only the current
contract that future work must know. Use [production evidence](production-evidence.md)
when chronology or provenance is necessary.

## Current backend inventory

The [production-only delivery decision](../adr/0022-production-only-with-disposable-e2e.md)
does not retain a separate persistent backend for tests or origin-side comparisons.
The production application is the web Worker `tudo-macae-terms-workers`
(`wrangler.web.jsonc`). Cloud Run service `tudo-macae-www` in `us-east5` is out of the
request path and of delivery; no repository code deploys or reads it.
The repository declares no App Hosting backend or configuration.

On 2026-10-04, provider read-back confirmed no App Hosting backends in
`macaetem-dev` and no Cloud Run service `macaetem-dev`. Authorization and evidence
are in [#1333](https://github.com/BetoFrega/macae-classificados/issues/1333).
Connections and stored build artifacts are not serving backends. That ticket
records their cleanup and the post-removal Billing measurement.

Read the control plane before operating; repository declarations do not prove absence:

```bash
pnpm dlx firebase-tools apphosting:backends:list --project macaetem-dev
gcloud run services list --project macaetem-dev --region us-east5
```

Cloudflare apex, www and MCP use proxied A placeholders `192.0.2.0`
(read back on 2026-10-04); routes and
redirect rules supply the actual request paths. Do not remove a Worker route or
disable the apex redirect to recover an origin: the placeholder serves no app.
Use the [production delivery guide](production-delivery.md#manual-recovery)
for application recovery and the [Worker runbook](www-origin-runbook.md#deploy-and-recovery)
for edge recovery. Historical test backends are not a requirement to recreate them.

Treat `tudomacae-staging` as retained historical infrastructure, excluded from
active delivery and qualification. Its existing resources are not a QA target:
keep fixtures, IAM changes, deployments and API/billing activation outside that
project. Run provider qualification with isolated disposable resources in the
active project, preserving production data and traffic. Revisiting the retired
staging project requires an explicit user request for that environment.

## Infrastructure adoption

When infrastructure adoption is explicitly requested, load the conditional
[infrastructure-adoption procedure](production-infrastructure-adoption.md).

## Open operational decisions

- Choose which layer should own security headers before applying them.
