# Classifieds persistence

Provider-free contracts for the shared Classifieds read/write set. Construct the D1
adapter through [the API Worker composition](../../apps/api-worker/classifieds.ts);
only its [db implementation](../../apps/api-worker/lib/db/classifieds.ts) knows D1.
The [migration](../../apps/api-worker/migrations-classifieds/0001_classifieds.sql) owns the schema.
The production [API entry](../../apps/api-worker/index.ts) does not construct this
adapter (`rg -n 'classifieds' apps/api-worker/index.ts`). Consumer composition,
authorization and domain decisions remain responsibilities of their capabilities.

## Records and transactions

[index.ts](index.ts) defines the public DTOs and operations. Record bodies retain
legacy fields; [records.ts](records.ts) validates storage shape, epoch milliseconds,
individual payload size and the existing catalog item bound. Product factories still
own validation, ownership, active taxonomy and publication eligibility.

| Kind | Identity and scope |
| --- | --- |
| `category`, `profile`, `ad`, `catalog` | Global ID; catalog ID is its identity's ID. |
| `subcategory` | Original local ID; `namespace` is its Category ID, also retained in `body.categoryId`. |
| `slugClaim` | Original slug; child claims use the Category ID as `namespace`. Global claims omit it. |
| `operation`, `audit` | Original ID; use the source collection as `namespace` when reconciling distinct legacy collections. |
| `adCleanup`, `photoCleanup`, `retirement` | Durable intent/claim IDs, independent of content lifetime. |

`version` is an opaque destination write token. `sourceVersion` preserves the opaque
source update version during transfer; profile and catalog revisions retain their
domain meaning. Every ordinary profile write advances its global revision inside SQL,
including publication/photo/area edits. Import preserves the supplied revision;
valid legacy profiles without one normalize to 1.

Within `transact`, read every record before replacing/removing it. Namespace is a
separate argument to `read`/`remove`; `put` derives a Subcategory's namespace from its
Category. Point reads and removals reject nonempty namespaces for globally keyed kinds;
Subcategories require their Category namespace. Never mutate a returned body to perform an external effect. Decisions may
repeat, so time, generated identifiers and validated request intent must be fixed
before entering the callback. File I/O, mail and HTTP effects run after commit using
durable intents.

Point epochs outlive deletion, protecting absence and create/delete/recreate races.
Query epochs cover membership and content changes. Each page returns an opaque `next`
cursor and a `version`: pin subsequent pages to that version and restart on conflict.
Filtered queries may conservatively conflict with unrelated writes of the same kind.
Read-only batches obtain contents and their epoch together on the primary; no replica
session is configured.

Transfer validation checks both record bodies and derived image projections against
the same storage envelopes used by the adapter. Compose `parseTransferItem` and
`createClassifiedsTransfer` with an artifact index using the adapter's image ownership
and cleanup job ID dependencies; runtime hashing stays outside the pure transfer seam.
The applying CLI pass consumes a private copy of the fully validated input; replacing
or editing the source after preflight cannot change the imported records.

All guards, mutations, projections and receipts commit in one D1 batch. Only a failed
guard retries the commit; a stale domain rejection is reevaluated against fresh reads.
Other SQL/provider failures propagate. Read/write count, bytes and retry envelopes are
defined in `persistenceLimits` and the adapter's `reading`, `command`, `sql` and `batch`
guards. These are command limits, not a maximum number of Anúncios per identity.

Receipts are keyed by actor plus operation key. Supply the complete validated request
as `intent.input`; reuse for a different operation/input conflicts. A committed receipt
is replayed after lost responses and survives content deletion. Domain audit and
operational telemetry remain separate.

## Identity confirmation and image intents

`manifest` returns a constant-size profile/epoch/count snapshot. Page every associated
Ad and catalog item required by the existing confirmation, pinned to the manifest's
identity epoch. The domain must authorize the actor, verify title/token/reason and
preserve confirmation of the entire set before calling `deleteIdentity`. The storage
primitive does not replace those decisions or impose a quantity limit.

`deleteIdentity` verifies the identity epoch, rejects active unlinked reservations and
unsafe legacy image paths, inserts cleanup intents with SQL `INSERT SELECT`, removes
the entire associated set and commits audit/receipt atomically. Foreign/shared paths
are skipped. Claims, expired reservations and completed images retain the cleanup
policy's delay and writer-completion evidence. A profile-owned photo creates a durable
photo job. Supply `correlationId` and `photoOperationId` matching the domain's result
when it exposes those identifiers. Defaults are deterministic for actor/key.

Supply validated `audit.reason` and optional `audit.channel`; the reason is retained
in the same atomic audit as the deletion. [deletion.ts](deletion.ts) reuses the domain's
pure eligibility, photo ownership and cleanup schedule before SQL applies effects.
Deletion receipts bind the requested input, audit metadata, profile ID, confirmation
epoch and explicit cleanup IDs. The result is compact: preserve counts, broad cache invalidations and
cleanup status rather than serializing every associated body into the receipt.
Consumers must invalidate all affected discovery/detail data; paging confirmation does
not permit partial deletion. SQL work, database size and cost still grow with the set.
Exceeding the provider batch duration rolls back; it must not silently truncate or
switch back to Firestore. Production capacity/configuration and recovery require
separate qualification before exposing this composition.

Deletion audits and default photo cleanup IDs derive from actor/operation key, so
separate operations may share a correlation ID. Audits retain that correlation as
data and expire after the existing 365-day administration retention period. `expireAudits(now)` deletes at most 16 expired audit
records per indexed call, advances transfer/query epochs and preserves receipts,
cleanup jobs and audits without a deadline. Consumer jobs must schedule this
operation before authority cutover; no automatic timer runs in this composition.

The optional aggregate `observe` callback contains operation, statement/parameter/SQL
sizes, bytes, elapsed duration and provider row counts. Its application composition
supplies service/environment/release/correlation and records unexpected failure once
at the response boundary under [OBSERVABILITY.md](../../OBSERVABILITY.md). Do not log
bodies, SQL, paths, identifiers or exception messages as metric dimensions.
Synchronous throws and rejected observer promises cannot fail committed operations;
observer promises are not awaited.

## Transfer seam

[transfer.ts](transfer.ts) exports an async stream of canonical NDJSON items:
`{ "type": "record", "record": RecordInput }` or
`{ "type": "receipt", "record": { "intent": OperationIntent, "result": Json } }`,
and imports one item idempotently, refusing divergent keys. Runtime fixtures use it
to seed and read back D1 state; the Firebase export and transfer CLIs that drove it
during the 2026-10-12 cutover are gone.

## Verification

```sh
pnpm --filter @tudomacae/classifieds-persistence run test
pnpm run test:worker apps/api-worker/tests/classifieds.runtime.test.ts
pnpm --filter @tudomacae/api-worker run typecheck
pnpm --filter @tudomacae/api-worker run build
pnpm run lint:boundaries
```

Set `CLASSIFIEDS_ENVELOPE_OUTPUT` to a temporary JSONL path when collecting local load
samples. Tests cover actual D1 guards/rollback, bounded conflict retry, provider-error
propagation, receipt replay/restart, duplicate indices, scoped legacy IDs, byte-limited
pages, maximum catalog and growing sets with historical image claims/reservations.
The process test verifies partial import/restart/repetition/export/compare. Local
runtime results establish behavior; they do not establish production quotas or load.
