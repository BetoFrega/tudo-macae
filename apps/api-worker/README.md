# Authentication API Worker

First backend slice of [#1671](https://github.com/BetoFrega/macae-classificados/issues/1671).
The existing Next application consumes Better Auth and tRPC over HTTP; identity,
credentials, sessions and verification attempts reside in D1. Remaining content
storage and editorial credentials stay in their existing runtimes.

[Classifieds persistence](../../packages/classifieds-persistence/README.md) lives in its own
D1 database ([ADR 0045](../../docs/adr/0045-separate-api-worker-databases.md)); `production.ts`
composes it from `CLASSIFIEDS_DB`.

Build and test commands belong to this workspace's `package.json`. `build.mjs`
creates a deployable bundle and copies both migration sequences. The compatibility
date matches the installed local runtime; advancing it requires runtime qualification.
`deploy.mjs` requires an explicit environment, distinct Authentication and Classifieds D1
IDs, API origin and calling service account; the checked-in D1 IDs are local placeholders.

Use the [authentication migration runbook](../../docs/agents/authentication-migration.md)
for disposable qualification, provisioning, global transfer and recovery. Publishing
this code does not provision resources, deliver real mail or change production authority.
