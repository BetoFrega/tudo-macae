---
record: adr
id: "0005"
status: accepted
decided: 2026-08-15
---

# 5. Editorial AI outside the application

## Context and requirements

[Editorial workflow](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) and
[source research](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a) own editorial behavior.
Hosting model jobs inside a near-zero-budget application adds token cost and
infrastructure before proving audience demand. A paid local client can perform the
work, but the domain API must not depend on one laptop's workflow permanently.

## Decision

Keep models, search, browsers and external research outside the application. Remote
MCP exposes narrow composable domain operations, never database paths or generic CRUD.
A repository-owned local stdio adapter presents that remote surface, reusing the MCP
SDK; it is not another domain API. Browser operation is fallback; WebMCP may later
consume the same module. No tool accepts a Firestore path.

Manual interface, clients and future automated callers share the domain interface.
Adding a server-side caller changes the caller, not the module. The application
validates and records external evidence without holding a model API key or hosting
model selectors. A hosted third-party client is a future compatibility/authentication
boundary, not a launch requirement.

## Alternatives and consequences

In-application generation puts per-token cost on the critical path. External clients
avoid that cost and preserve a caller-independent seam, but assisted production
requires an available authorized client. Initial local support is Codex desktop,
CLI and IDE; distribution to another client waits for a second real consumer.
Credential custody follows [0009](0009-scoped-editorial-tokens-before-oauth.md).

## Scope and amendments

The former human-interface-only publication/correction restrictions were superseded
on 2026-09-11. Authority and the exact-version publication requirement are now owned
by the editorial contract; relocation does not restore the old restriction.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0005-ai-drafts-outside-the-product-humans-publish.md) preserves earlier dated wording and superseded clauses.
