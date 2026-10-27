# Retired editorial workflow

The blog uses the existing human panel. Editorial CLI, MCP, client setup and
automated newsroom workflows are retired by [#1845](https://github.com/BetoFrega/macae-classificados/issues/1845).
The [Blog contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a?pvs=204) owns the current behavior.
Historical records remain stored; this change does not provision or dismantle providers.

The machine hostname returns uncached 404 responses for every route. Candidate
verification retains independent origin proofs and host isolation; `pnpm run probe:edge`
checks unavailable MCP, tools and session routes after deployment. Before deployment,
the previous protocol can still be served; Git delivery does not qualify retirement.
