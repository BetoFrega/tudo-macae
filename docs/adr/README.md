# Architectural decisions

ADRs record significant structural choices in application architecture, infrastructure
and technical harness mechanisms. [Domain Docs](../agents/domain.md) owns the review
criteria and [the template](TEMPLATE.md) owns the record format.
[Product contracts](https://app.notion.com/p/3f684301eab381fdb618ca7626c9f609) own behavior and policy; operating guides own
procedures. This index is discovery only. Each record's metadata owns its status and
original decision date; acceptance does not certify implementation or activation.

## Architecture records

- [0046 — Move the current Next application to Workers with vinext as a bridge](0046-move-the-next-application-to-workers-with-vinext.md)
- [0045 — Give each API Worker context its own D1 database](0045-separate-api-worker-databases.md)
- [0044 — Store Classifieds authority in D1](0044-store-classifieds-authority-in-d1.md)

- [0043 — Use Cloudflare Hosted Images across surfaces](0043-use-cloudflare-hosted-images-across-surfaces.md)
- [0042 — Verify editorial cache purge during retirement](0042-verify-editorial-cache-purge-on-retirement.md)

| Record |
|---|
| [1. Use npm instead of pnpm](0001-use-npm-instead-of-pnpm.md) |
| [2. Expiring notes for temporary workarounds](0002-expiring-notes.md) |
| [4. Media as an autonomous library with closed kinds](0004-media-as-an-autonomous-library-with-closed-kinds.md) |
| [5. Editorial AI outside the application](0005-ai-drafts-outside-the-product-humans-publish.md) |
| [6. `overrides` para advisories em dependências transitivas](0006-npm-overrides-for-transitive-advisories.md) |
| [8. Auditable Source Permissions without a Media dependency on Editorial](0008-press-as-a-controlled-factual-source.md) |
| [9. Opaque root PAT before OAuth](0009-scoped-editorial-tokens-before-oauth.md) |
| [10. One deep editorial module behind every caller](0010-one-editorial-module-behind-every-caller.md) |
| [11. Two-step private and sanitized Media ingestion](0011-staged-and-sanitized-media-ingestion.md) |
| [12. Stateless bounded operations with durable replay and concurrency](0012-stateless-and-bounded-mcp-editorial-operations.md) |
| [13. Recoverable publication of the exact version across package boundaries](0013-review-the-exact-submission-before-publication.md) |
| [14. Machine-specific edge and incident-control boundary](0014-a-machine-specific-edge-contract-for-mcp.md) |
| [15. Coherent editorial cutover without dual writers or destructive rollback](0015-clean-editorial-cutover-and-assisted-pilot.md) |
| [16. Separate disposable staging data from permanent control](0016-separate-disposable-staging-data-from-permanent-control.md) |
| [17. Require origin validation before reusing immediately fresh public HTML](0017-revalidate-immediately-fresh-public-html.md) |
| [18. Keep publication completion independent of visibility in the same Ad record](0018-preserve-ad-publication-intent.md) |
| [19. Read current state in every operational screen](0019-read-current-state-in-operational-screens.md) |
| [20. Restrict staging application access through Cloudflare Access](0020-restrict-staging-application-access.md) |
| [21. Share staging operations across human and test callers](0021-share-staging-operations-across-human-and-test-callers.md) |
| [22. One persistent production environment with delivery on every main push](0022-production-only-with-disposable-e2e.md) |
| [23. Permanent MCP and HTTP CLI over one canonical catalog and executor](0023-editorial-cli-over-http.md) |
| [25. Neutral shared machine transport for separate domain capabilities](0025-neutral-machine-tools-with-administrative-categories.md) |
| [26. Provisional Tudo Macaé MCP discovery with live execution authority](0026-provisional-editorial-mcp-discovery-with-live-execution-authority.md) |
| [27. Context-owned vocabulary with selective information discovery](0027-route-bilingual-vocabulary-through-context-map.md) |
| [28. Shared profile administration with atomic receipts, revisions and cleanup intents](0028-machine-administration-of-claimable-advertiser-profiles.md) |
| [29. Short editorial client sessions derived from PATs](0029-short-editorial-client-sessions-derived-from-pats.md) |
| [30. Project the public catalog from compatible legacy profile storage](0030-business-is-the-public-catalog-entity.md) |
| [34. Derive Ad authority through its associated Advertiser Identity](0034-ads-belong-to-advertiser-identities.md) |
| [35. Accept the combined App Hosting build/runtime baseline in staging](0035-staging-build-runtime-permission-baseline.md) |
| [36. One Article identity with immutable effective Edition history](0036-single-article-identity-with-edition-history.md) |
| [37. Use TanStack Start, Router and tRPC for the Workers web migration](0037-use-tanstack-start-router-and-trpc-for-workers-web.md) |
| [38. Deploy the Workers web application and tRPC API separately](0038-deploy-workers-web-and-trpc-api-separately.md) |
| [39. Route browser tRPC through the same-origin edge](0039-route-browser-trpc-through-the-same-origin-edge.md) |
| [40. Migrate backend capabilities before replacing the web renderer](0040-migrate-backend-before-replacing-the-web-renderer.md) |
| [41. Replace Firebase Auth with Better Auth in the first backend cut](0041-replace-firebase-auth-with-better-auth-in-the-first-backend-cut.md) |

## Preserved legacy paths

These short pointers retain earlier URLs and link to the canonical destinations.
They are not another architectural decision with their legacy ID. In particular, the
staging baseline's old 0018 path now points to 0035; publication retains canonical 0018.
Original rationale and superseded wording remain in Git history.

| Pointer |
|---|
| [3. News sourcing limited to primary and permitted sources](0003-news-sourcing-limited-to-primary-and-permitted-sources.md) |
| [7. O seed de demonstração é datado no passado](0007-demo-seed-dated-in-the-past.md) |
| [18. Accept the App Hosting build/runtime permission baseline in staging](0018-accept-app-hosting-build-runtime-baseline.md) |
| [24. Single-owner editorial authority and mutable Article editions](0024-single-owner-editorial-authority-and-mutable-article-editions.md) |
| [31. Separate moderation visibility from publication status](0031-separate-moderation-visibility-from-publication-status.md) |
| [32. Conversations belong to participant profiles](0032-conversations-belong-to-participant-profiles.md) |
| [33. Review private conversations after reports](0033-review-private-conversations-after-reports.md) |
