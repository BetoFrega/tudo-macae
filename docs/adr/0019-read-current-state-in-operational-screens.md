---
record: adr
id: "0019"
status: accepted
decided: unknown
---

# 19. Read current state in every operational screen

Administration, the newsroom, account management, advertisement creation/editing and other operational screens must read the current persisted state on each read. Their data readers must not use `"use cache"` or another cache that reuses query results across requests, including indirect readers and shared components. Authorization remains at its existing boundary; removing caching does not make a reader public. This accepts additional database reads so a completed mutation is visible on the next operational read, without expiry waits, retries or purge endpoints.

Keep operational readers separate from cached public readers when both use the same underlying use case. A live wrapper must call the uncached implementation, never a cached public wrapper. Shared navigation also follows this rule when rendered in an operational screen; its live query runs at request time inside a Suspense boundary. This extends the existing live category reader and per-operation administrative MCP control reads into one application-wide contract.

Public discovery and reading surfaces may retain explicit data/component caches and their invalidation policies. [ADR 0017](0017-revalidate-immediately-fresh-public-html.md) governs external reuse of public HTML; it does not make an operational data cache acceptable or authorize `Cache-Control: public` on authenticated responses. This decision concerns current reads, not continuous synchronization of a page that performs no new read.

Verify the boundary by tracing page, layout and action calls from operational routes to their readers, then exercise mutations followed by ordinary navigation in the production-build E2E suite. The cache directives can be enumerated with `rg -n 'use cache|unstable_cache' src`; a direct-only search of page files is insufficient. Keep the observed intermittent cache failures and their diagnosis separate from compliance with this contract.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0019-read-current-state-in-operational-screens.md) preserves earlier dated wording and superseded clauses.
