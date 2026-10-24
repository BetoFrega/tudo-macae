---
record: adr
id: "0029"
status: accepted
decided: 2026-09-17
---

# 29. Short editorial client sessions derived from PATs

## Context

The permanent CLI and MCP interfaces share one stable Editorial Client and PAT, but
reading that PAT from 1Password on every command or process restart repeatedly requires
native authorization. Persisting the PAT elsewhere would create a second copy of the
root credential, while OAuth, a refresh token and device-bound proof exceed the current
first-party local-client boundary.

## Decision

The server issues an opaque **Editorial Client Session** through `POST /sessions/v1`
only when presented with a valid PAT. Its lifetime is the earlier of 24 hours after
issuance and the PAT parent's expiry. The token has its own public id and 256-bit secret;
the server stores only its digest, parent PAT, Editor, Editorial Client, creation,
expiry and historical revocation state. A session cannot issue another session.
`/sessions/v1` accepts only `POST`; PAT revocation in the Redação is the single
authority-removal path and invalidates every derived session on its next request. The
resource returns `Cache-Control: no-store`.

Normal requests resolve the session and then re-evaluate its PAT parent, current Editor
and Administrator roles, credential profile and global mode. The session copies no
capability. Session expiry is checked before physical cleanup, issuance has its own
per-client rate limit, and each successful issuance makes a bounded best-effort cleanup
pass over expired session records. Direct PAT authentication on normal MCP and HTTP resources was a
bounded deployment bridge only, to be removed once both local clients and the edge
resource completed the coordinated cutover.

CLI and MCP use one local session provider partitioned by canonical endpoint origin and
a digest of the local 1Password configuration. It persists only the short session in a
user-owned directory below the operating-system user's private temporary directory,
with `0700` directory and `0600` file modes, symlink and owner rejection, atomic
replacement and a bounded recoverable inter-process lock. A valid cached session avoids
1Password. Renewal first elects one task with a temporary lease. That task returns a
typed, lease-bound host continuation; followers wait within a bound and never request a
parallel native authorization. The host continuation validates its generation under the
definitive lock before reading the PAT, then rereads the cache and publishes one session.
An expired lease can be replaced, while an old winner is fenced before 1Password access.

An authentication rejection invalidates only the exact session and generation used.
Authority failures, rate limits, server failures and domain errors preserve the cache.
During issuance, a terminal PAT rejection is classified as
`installationAuthorityRejected`; the current lease remains fenced so concurrent calls
do not reopen 1Password even after its original expiry. The same elected, lease-bound
continuation can be retried only after the agent has directed restoration in the Redação
and configured field; a successful retry replaces the rejection with the new session.
Renewal happens only before an unsent operation; session continuation never replays a
request whose outcome may already exist. CLI help and MCP discovery expose neither
forced recovery nor local logout.

## Consequences

The bearer session remains sensitive to other processes running as the same operating
system user, but its bounded lifetime and live parent checks limit
that risk without pretending local encryption adds a new trust boundary. Activating
`/sessions/v1` still requires the manual Cloudflare cache, challenge and method rules
plus credential-free and authenticated probes; repository code does not apply or claim
those external changes.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0029-short-editorial-client-sessions-derived-from-pats.md) preserves earlier dated wording and superseded clauses.

## Scope and amendments

Amended on 2026-09-18; the decision date in metadata remains 2026-09-17.

Amended on 2026-10-24: the editorial CLI and MCP were retired
([Retired editorial workflow](../agents/mcp-edge-runbook.md)), so the PAT bridge left
with them instead of through the cutover. The machine hostname answers `/mcp` and
`/sessions/v1` with an uncached 404, verified by the `mcp.retired` check of
`npm run probe:edge`.
