---
record: adr
id: "0009"
status: partially-superseded
decided: 2026-08-27
---

# 9. Opaque root PAT before OAuth

## Context and requirements

First-party local clients need accountable access before dynamic third-party
connections justify an OAuth/OIDC authorization service. A shared permanent secret
would erase Editor and installation identity. Product authority is in
[Editorial workflow](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a).

## Decision

Issue one opaque root PAT per named EditorialClient installation, with a short public
lookup ID and 256-bit random secret. Store only a SHA-256 digest and compare in
constant time; reveal the value only on issuance. Verify the owner's live Editor role
on every request; administrative incident revocation grants no editorial authority.

Keep the PAT in the configured 1Password item, never repository/project files, URLs,
command arguments or another credential store. Client use of short sessions follows
[0029](0029-short-editorial-client-sessions-derived-from-pats.md); the PAT is not
retained as a normal-operation process credential. The configured item is the sole
lookup, with desktop integration, no service account and explicit human-presence
continuation. Failed credential recovery never replays a domain write.

OAuth 2.1 with OIDC replaces the root adapter when hosted or dynamic third-party
connections enter scope, without changing the domain module. The canonical machine
host and resource policy follow [0014](0014-a-machine-specific-edge-contract-for-mcp.md).

## Alternatives and consequences

This provides individual identity and immediate revocation without another identity
provider. The habitual full profile has no mandatory PAT expiry after the 2026-09-11
refinement; temporary credentials may expire. A digest limits server credential
exposure, while secret custody remains an installation responsibility.

## Scope and amendments

The refinement accepted on 2026-09-11 superseded granular scopes, mandatory
90-day expiry and Delegation requirements. This partial-supersession amendment
was recorded on 2026-09-13; profiles and editorial powers are in the contract.
Discovery was superseded on 2026-09-15 by [0026](0026-provisional-editorial-mcp-discovery-with-live-execution-authority.md).
Startup PAT retention/read/recovery was replaced by the session lifecycle in 0029.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0009-scoped-editorial-tokens-before-oauth.md) preserves earlier dated wording and superseded clauses.
