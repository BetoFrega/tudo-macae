---
record: adr
id: "0028"
status: accepted
decided: 2026-09-16
---

# 28. Shared profile administration with atomic receipts, revisions and cleanup intents

## Context and requirements

[Claimable profile administration](https://app.notion.com/p/3ff84301eab381debc5fe4e1c3f9b837)
owns access, supported variants, duplicate confirmation, update effects and exclusions.
Machine transports must reuse the human capability without silently expanding lifecycle.

## Decision

The shared domain capability handles every caller behind the canonical catalog/executor.
Every profile writer, including photo/Activity Area changes, participates in one global
revision. Strict patches validate resulting records, expected revision and lifecycle
preconditions; concurrent ownership/Ads changes refuse deletion, never force/cascade.

Use normalized queryable name/contact keys for duplicates, not an unbounded collection
scan. Confirmation binds to the complete evidence and normalized intent; the concrete
paginated transactional proof is resolved during implementation. Normalization precedes
fingerprints so omitted/default claimable states identify the same operation.

Commit mutation, actor/operation-bound idempotency receipt and content-free administrative
audit atomically. After live authorization, resolve a prior receipt before current
profile preconditions, so update/delete replay survives its first success. Reuse for
another intent conflicts; validation/revision/duplicate failure does not consume the key.
An unchanged success has a receipt without revision increment. Return separate outcome,
replay and cache effects; adapters invalidate without making the domain import Next cache.

Deleting a photo-bearing profile commits a durable cleanup intent with deletion/audit/
receipt. Bounded draining after each administration operation, including deletion,
retries object cleanup through later traffic, without an external periodic runner.
Replay returns the same cleanup operation; logical deletion need not wait for bytes.

## Alternatives and consequences

Independent machine writers bypass invariants; transport-specific copies drift.
Receipts before current preconditions preserve destructive replay semantics. Durable
intents bridge document/object storage at the cost of cleanup possibly remaining
pending until administration traffic returns. Audit is separate from copied private data.

Before discovery, inventory existing state/revisions/normalized keys and migrate all
writers to the revision seam. Do not infer or repair corrupt states automatically.
Public eligibility and lifecycle coherence remain distinct under the contract. Photo
upload is a separate prepare/finalize lifecycle, not arbitrary storage paths in JSON.

The [pre-reorganization record](https://github.com/BetoFrega/macae-classificados/blob/7da1e3af1bb963d42cc75578463816155a63c3e9/docs/adr/0028-machine-administration-of-claimable-advertiser-profiles.md) preserves earlier dated wording and superseded clauses.
