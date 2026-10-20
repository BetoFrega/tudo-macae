---
name: server-action-transport
description: Diagnose recurring POST / Server Action 500 failures or migrate browser-triggered reads to ordinary HTTP routes in Tudo Macaé.
---

# Server Action transport

Use this skill when a browser read invokes a Server Action during mounting, focus, visibility, navigation or refresh, or when Next reports a `POST /` action decoder failure. The decoder can fail before the action function runs, so a `catch` inside it does not repair that transport failure.

1. **Attribute the request.** Record the triggering event, sanitized action ID, browser request-body byte count, response status, release and correlation ID. Use the existing HTTP diagnostics and server logs. Compare an origin-observed byte count when a supported, bounded hook can capture it without consuming the action stream. State explicitly when the origin count is unavailable; browser length alone cannot localize truncation. Keep arguments, cookies and tokens out of diagnostics. A shared URL or digest alone does not identify an action. If attribution is unavailable, state which callers are demonstrated risks and which remain hypotheses.
2. **Move demonstrated automatic reads.** Give each affected read a GET route with no request body and a small same-origin browser client. Keep the existing use case and ownership checks behind the route. Return only the needed data; use `Cache-Control: private, no-store` and `Vary: Cookie` for account-specific results. Preserve null/unauthenticated behavior, query validation, stale-result protection and visible failure handling. For a mutation, design its HTTP method, authorization and retry semantics from that operation before changing transport.
3. **Prove the boundary.** Verify browser calls use the new route, route tests cover anonymous and unauthorized inputs plus cache headers, and the affected user journeys pass E2E. A focused retry diagnoses the path; the full-suite reproduction is the completion check for a full-suite failure. If it cannot run, record that limitation in the issue and PR.

Use [Test Selection](../../../docs/agents/test-selection.md) for the test tier and [Issue Tracker](../../../docs/agents/issue-tracker.md) for the diagnostic record. Do not infer the spontaneous cause of an empty or truncated body from a successful migration.
