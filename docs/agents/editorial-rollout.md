# Editorial cutover and qualification

[ADR 0015](../adr/0015-clean-editorial-cutover-and-assisted-pilot.md) owns the
non-destructive cutover choice. The [editorial contract](https://app.notion.com/p/3f684301eab38152baa8d10e9cc74d8a)
owns current authority and delivery scope; [Production delivery](production-delivery.md)
owns dispatch/recovery. This guide does not qualify a deployed revision by itself.

## Coherent adoption

Inventory collections and Storage prefixes before the first mutation for the rollout
stage. Unexpected data requires a specific migration decision, never deletion or
silent conversion. A real pilot creates durable reusable work; later audits distinguish
expected pilot records from unexplained legacy data instead of requiring emptiness.

Adopt the shared module behind existing callers, then cut server, adapter, assisted
workflow and human interface to the same contract together. Issue and verify replacement
credential profiles before revoking active legacy credentials; do not infer broader
access. Remove obsolete writers only after the replacement capability is proven;
keep historical records readable. New-flow legacy Articles normalize lazily under
[0036](../adr/0036-single-article-identity-with-edition-history.md).

Validate the complete manual workflow in production before public publication
moves to the new model.

Deliver usable vertical capabilities and exercise each in production after its
separate activation. An earlier read or pre-publication pilot does not prove publication,
Media delivery, correction or another capability that was absent. Use the current
readOnly/disabled incident mode to contain mutations; rollback must be compatible with
the additive schema. Correct forward when no compatible previous version is proved.

## Verification and evidence

Repository checks and applicable test layers cover pure lifecycle/authorization,
transactions/replay/revision/live roles, activity, Media ingestion and interrupted
publication reconciliation. Integrated journeys exercise creation, editing, Submission,
reopening/resubmission, publication, adjustment, evidence-backed update, correction,
withdrawal, off-air editing and republication through the actual MCP path and manual
interface. Verify canonical URL, original time, history, future-time visibility,
lazy normalization, stale-write refusal and incident controls. No test holds a
production token or deliberately floods the limiter.

Record timestamp, exact deployed revision, non-secret domain identifiers, edge probe,
negative checks, observed final states and final incident mode in the applicable issue.
Probe idempotent replay, stale revision, revoked credentials and refusal in readOnly.
Reusable work survives an interrupted run; quarantine expiry is not registered Media
deletion. Automation remains a separately specified caller, not an implicit rollout step.

The original 2026-08-27 sequence started human Redação, then reads, then assisted
pre-publication work before publication/Media qualification. Origin proof, granular
scopes, expiring windows, mandatory Delegation and ten-task expansion gates from that
plan were superseded under ADR 0015; they are not current authorization requirements.
