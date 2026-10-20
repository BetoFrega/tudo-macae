---
record: adr
id: "0042"
status: accepted
decided: 2026-10-06
---

# 42. Verify editorial cache purge during retirement

## Context and requirements

The [Media lifecycle contract](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835) requires cached editorial
delivery without an origin read on each hit. The inherited origin guard defeats that
boundary: an editorial HEAD performs publication reads and downloads the complete
sanitized file. The user rejected that unapproved cost and approved verification and
retry during retirement in [#1292](https://github.com/BetoFrega/macae-classificados/issues/1292).

An in-flight transform can insert a variant after a purge. A deterministic
reproduction exercises that ordering; it does not establish provider behavior.
Cloudflare's [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
does not expose a conditional insertion or fence against a prior purge.

## Decision

Keep editorial authorization at origin reads on cache misses and original fallbacks.
Use event-driven tag/source-URL purge followed by bounded observations of origin denial
and the allowed Worker cache variants. Read-only HEAD probes bypass the visitor flag,
inspect the existing cache and return presence/absence without image bytes or a fill.
Require separated absent observations; repeat purge when a variant reappears. Preserve
the durable cleanup intent when provider calls or observations remain unconfirmed.

The application composes a pure verified-purge orchestrator with HTTP and provider
adapters. It clears the intent only through the existing Article version check.
Ad/Profile delivery remains outside this change. Deploy the probe-capable Worker before
the application so unsupported observations fail closed as pending cleanup.

## Alternatives and consequences

Per-hit origin validation was rejected by the user. A strongly consistent generation
read on each hit could fence old keys but introduces a new request-path dependency;
that alternative was not selected. Immediate API acknowledgement alone cannot observe
late writes. Repeated purge and separated observations move cost to retirement and
detect writes within the observation window, at the cost of slower mutations and
possible manual recovery.

Observations cover the reached points of presence, not every location or a write
after the bounded window. Source-URL purge of the transformation cache still relies
on the provider's result; Worker probes do not inspect that internal cache. This is
eventual recovery, not strict global revocation. Reconsider the design if the product
requires a global fence rather than this accepted contract.

## Scope and amendments

Acceptance records the user's instruction in this task, not implementation, deployment
or canary activation. Operating verification follows
[Editorial image canary](../agents/editorial-image-canary.md). No prior ADR prescribed
the inherited per-hit image guard, so this record supersedes no ADR.
