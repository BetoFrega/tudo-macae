---
record: adr
id: "0041"
status: accepted
decided: 2026-10-06
---

# 41. Replace Firebase Auth with Better Auth in the first backend cut

## Context and requirements

The maintainer selected Better Auth for the first backend cut of the
[#1406 redesign](https://github.com/BetoFrega/macae-classificados/issues/1406).
This changes the identity-provider boundary previously retained by
[ADR 0040](0040-migrate-backend-before-replacing-the-web-renderer.md), while
preserving its backend-first ordering and separate web and API Workers.
The [Access Account contract](https://app.notion.com/p/3ff84301eab38138950cf38d73f46605) owns the approved
password-recovery requirement for migrated accounts. The
[owning glossary](../contexts/identity-access/CONTEXT.md) requires identity continuity
independent of the authentication method.

## Decision

Run Better Auth in the API Worker with authoritative authentication persistence
in D1 as part of the first backend capability. Adapt the current Next consumers
before replacing their renderer with TanStack Start. Use Better Auth's HTTP
authentication handler alongside the tRPC application transport; domain callers
consume the application's identity and authorization interfaces.

The cut now includes accounts, credentials, sessions, account status, role
authority and verification state, rather than only verification attempts.
Preserve account identity and existing ownership and audit references across
every caller, including editorial machine credentials. The representation may
retain existing identifiers or use an explicit mapping; an email match alone
does not establish identity continuity.

Qualify session issuance, current account status, live roles, revocation,
verification, password recovery and mail delivery in Workers before activation.
Apply the [email verification contract](https://app.notion.com/p/3ff84301eab381c09277c57aed13fe53) through
an explicit post-recovery rule. Record the address that received the recovery
link and compare it with the current account address before asserting verification;
a user identifier alone cannot prove which address received an earlier token.
New authentication authority must serve unmigrated domain consumers as well as
the API's migrated capabilities. At activation, consumers must stop authorizing
requests through Firebase session or refresh cookies, following the Access Account
contract. Keep no grace path that verifies old sessions through Firebase or
exchanges them for Better Auth sessions. Existing Firebase action codes still
require routing to the replacement journeys described by the Access Account
contract. After the cut, do not consume old codes through Firebase or convert
them into Better Auth tokens or verification results.

## Alternatives and consequences

Migrating the backend with Firebase Auth and replacing authentication later
separates changes but requires building and then replacing that integration.
Keeping Firebase Auth minimizes account changes but retains the provider
dependency. Selecting Better Auth in the first cut avoids that intermediate
integration, at the cost of a larger initial migration and application-owned
mail delivery and authentication operation.

Better Auth documents [D1 integration](https://better-auth.com/docs/concepts/database),
[TanStack Start integration](https://better-auth.com/docs/integrations/tanstack)
and [email password recovery](https://better-auth.com/docs/authentication/email-password).
These integration paths are not proof of compatibility with this application's
contracts or a successful production migration. Reconsider the provider if
Workers/D1 qualification cannot preserve identity continuity, live authorization
or the approved recovery and verification contracts through supported adapters.
Compare an alternative against those same requirements before changing provider.

## Scope and amendments

This record supersedes only ADR 0040's decision to preserve Firebase Auth and
its corresponding first-cut qualification requirements. The ordering, data
authority, controlled global activation and recovery requirements remain in
ADR 0040 and apply to the expanded cut.

The accepted product contract removes legacy password-hash compatibility from
the migration requirements and owns recovery initiation, session termination,
legacy-link handling and the first cut's email-access exception policy.
Acceptance does not certify implementation, delivery, identity transfer or
production activation.
