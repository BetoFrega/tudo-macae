---
record: adr
id: "0014"
status: partially-superseded
decided: 2026-08-27
---

# 14. Machine-specific edge and incident-control boundary

## Context and requirements

Cloudflare browser bot detection must not challenge non-interactive clients or cache
private tool replies. Repository code cannot claim to apply a zone not imported as IaC.
Editorial powers are in [the contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a).

## Decision

Use narrowly scoped machine-host rules for canonical MCP, HTTP tools and session
resources: bypass cache/JavaScript challenges, retain TLS, WAF, abuse detection and
rate limits. Accept protocol methods/content types; unrelated paths are rejected.
Application replies use no-store and suitable non-HTML security headers. A framework
trailing-slash redirect is normalization, not another handler or authorization path.

Each operation validates its credential/session parent, live roles, profile and mode.
After the 2026-09-11 refinement, TLS, WAF, rate limits and the 256-bit token provide
the editorial authorization boundary without a separate Cloudflare-injected editorial
origin-proof secret. This does not supersede the service-origin protection in
[Production topology](../agents/production-topology.md). A separate editorial Worker
requires a demonstrated threat-model need.

Static deployment configuration caps enabled/readOnly/disabled operation. Dynamic
emergency control may restrict it without mandatory expiry; missing/unavailable control
falls back to deployment configuration rather than disabling by itself. Role-validated
administrative control writes record actor/time/revision and use expected revision.
Credential revocation and global mode are independent containment mechanisms.
Emergency-control input policy belongs to the
[editorial contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a).

No cross-origin browser access at launch. Future first-party WebMCP uses its own
session path rather than exposing a PAT to page JavaScript; third-party origins
require an OAuth consent decision. Ordinary correlated operational logging excludes
credentials and content; persistent dedicated security/metric collections require use.
The required MCP signals and detections belong to
[Observability](../../OBSERVABILITY.md#editorial-machine-operations).

## Alternatives and consequences

Machine-specific policy avoids weakening the public site or removing WAF. An extra
editorial edge proof was superseded in the single-owner model; the earlier decision
and rotation rationale remain in Git. Edge changes remain a deliberate operation under
[Production operations](../agents/production-operations.md) and the
[edge runbook](../agents/mcp-edge-runbook.md), with exact deployed-path verification.

A credential-free probe runs weekly/on demand to verify DNS/TLS, no browser challenge,
structured unauthorized reply, no-store/no cache participation and resource isolation.
Drift has one tracker record; the probe holds no editorial credential and mutates no
content. Acceptance of this record is not proof that rules are deployed.

## Scope and amendments

The 2026-08-30 origin-proof and expiring fail-closed dynamic-control requirements were
superseded on 2026-09-11. The MCP-only resource restriction was superseded on 2026-09-15
by [0025](0025-neutral-machine-tools-with-administrative-categories.md); session
resources/authentication follow [0029](0029-short-editorial-client-sessions-derived-from-pats.md).
Discovery follows [0026](0026-provisional-editorial-mcp-discovery-with-live-execution-authority.md).

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0014-a-machine-specific-edge-contract-for-mcp.md) preserves earlier dated wording and superseded clauses.
