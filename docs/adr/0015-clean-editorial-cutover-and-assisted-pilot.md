---
record: adr
id: "0015"
status: partially-superseded
decided: 2026-08-27
---

# 15. Coherent editorial cutover without dual writers or destructive rollback

## Context and requirements

The initial audit of 2026-08-27 found no production Articles, so synthetic Submissions
and a legacy-evidence backfill had no data to justify them. Later real pilot records
and legacy Articles invalidate treating that audit as a perpetual emptiness guarantee.
Workflow scope is in [the contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a).

## Decision

Replace each complete legacy capability when its new writer lands; keep the app green
without dual writes. Before production mutation, inventory relevant collections and
Storage prefixes against that rollout stage's expected records. Unexpected data stops
the cutover for a specific migration decision, never silent conversion/deletion.
After real pilots, distinguish their durable records from unexplained legacy data.

Adopt the shared module, then cut server/client/interface together and remove obsolete
writers while history stays readable. Existing Articles normalize lazily on first
new-flow mutation under [0036](0036-single-article-identity-with-edition-history.md),
without an unproven bulk migration. Emergency readOnly/disabled mode contains writes;
there is no destructive reverse migration or return to incompatible legacy writers.
Correct forward unless a previous application revision is demonstrably schema-compatible.

## Alternatives and consequences

Dual writers and synthetic history add migration risk. Incremental coherent capabilities
permit real validation before the entire newsroom is complete. Preflight/pilot results
prove only capabilities present at that stage. Registered Media is not disposable test
data; cleanup limits follow [Media lifecycle](https://app.notion.com/p/3ff84301eab381beafe5cbcfa3eef835).

## Scope and amendments

The initial staging of human interface then reads then assisted writes was a rollout
plan, now in [Editorial rollout](../agents/editorial-rollout.md). The refinement
accepted on 2026-09-11 superseded scopes, Delegation, origin proof, expiring windows
and ten-Delegation expansion gates. This partial-supersession amendment was recorded
on 2026-09-13. Preserve non-destructive rollout and evidence principles without treating
those old gates as current authorization.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0015-clean-editorial-cutover-and-assisted-pilot.md) preserves earlier dated wording and superseded clauses.
