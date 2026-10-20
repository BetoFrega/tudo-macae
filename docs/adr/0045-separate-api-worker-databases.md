---
record: adr
id: "0045"
status: accepted
decided: 2026-10-11
---

# 45. Give each API Worker context its own D1 database

## Context and requirements

The API Worker serves Authentication and, for the [Classifieds cutover](https://github.com/BetoFrega/macae-classificados/issues/1719), Classifieds. `tudo-macae-authentication-<env>` was created for Authentication only, but Classifieds migrations and the [authority record](0044-store-classifieds-authority-in-d1.md) were added to it through the single generic `DB` binding without a recorded decision. The two contexts share no SQL: Classifieds reads account state only through the identity reader. Production Authentication had no Classifieds tables applied, so separating moves no data.

## Decision

Keep one API Worker ([0038](0038-deploy-workers-web-and-trpc-api-separately.md), [0040](0040-migrate-backend-before-replacing-the-web-renderer.md)) with one D1 database per context ([topology decision](https://github.com/BetoFrega/macae-classificados/issues/1719#issuecomment-6115602548), [separation](https://github.com/BetoFrega/macae-classificados/issues/1719#issuecomment-6115560549)):

- Bindings are named by owner, `AUTHENTICATION_DB` (`tudo-macae-authentication-<env>`, `apps/api-worker/migrations/`) and `CLASSIFIEDS_DB` (`tudo-macae-classifieds-<env>`, `apps/api-worker/migrations-classifieds/`, numbered from 0001). No generic D1 binding exists.
- One composition root per context reads its binding: `lib/serveApiRequest.ts` for Authentication, `production.ts` for Classifieds. Other modules receive the database or adapter by injection.
- No SQL, transaction or batch spans both databases; Classifieds reads accounts through the identity reader.
- Deployment requires both database ids, refuses equal ids, and applies both migration sequences.

`bin/apiWorkerDatabaseBoundary.test.ts` fails when a binding is read outside its root or a migration sequence creates the other context's objects.

## Alternatives and consequences

Keeping the shared database would couple Classifieds recovery (a Time Travel restore before promotion) to Authentication sessions and accounts created in the meantime. A gateway Worker with a Worker per domain was rejected as premature: it adds deployables, service bindings and cross-Worker failure modes without a current need. The cost is a second database and migration ledger per environment, and account checks that cannot join Classifieds rows.

Reconsider extracting a context into its own Worker when release cadences block each other, a context reaches Worker CPU or memory limits, or a context requires a distinct security posture. The boundaries above keep that extraction mechanical.

## Scope and amendments

Acceptance covers code and configuration. Creating each environment's Classifieds database and applying its migrations are operational steps in the [cutover runbook](../agents/classifieds-cutover.md).

2026-10-13: Blog and shared Media form a third context, `EDITORIAL_DB` (`tudo-macae-editorial-<env>`, `apps/api-worker/migrations-editorial/`), in one database because a Blog save reads Media and writes publication grants in one transaction ([#2047](https://github.com/BetoFrega/macae-classificados/issues/2047)). The binding, its composition root and the deployment id arrive with its first consumer.
