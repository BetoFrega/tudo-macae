---
record: adr
id: "0048"
status: proposed
decided: 2026-11-06
---

# 48. Transfer a claimable Business through a reviewed claim ledger

## Context and requirements

Issue [#133](https://github.com/BetoFrega/tudo-macae/issues/133) lets the owner of a
claimable Business take over its page. On 2026-11-06 Beto chose manual review in `/admin`
as the proof rule (D-PdM-04). The reason: on 2026-11-04 the production D1 had 343 claimable
Businesses, all with a telephone number and none with an e-mail, and the Worker has no
WhatsApp or SMS provider. Ownership must keep following the Business identity
([0034](0034-ads-belong-to-advertiser-identities.md)). An owned profile must have a
`userId`, must not be `claimable` and must have no `source`
(`isOwnedAdvertiserProfile` in `packages/advertiser-identity/model.ts`).

## Decision

- Every claim and review for a Business lives in one ledger record:
  `kind: "operation"`, namespace `business_claims`, id = Business id. Several pending claims
  for one Business form a dispute, which the reviewer settles. The ledger is permanent.
  Each review also writes an `audit` record (namespace `business_claim_review`) with the
  administrative-audit retention.
- Approval is one `ClassifiedsPersistence.transact` with the review's operation id as
  idempotency key. That transaction re-reads the ledger and the profile, marks the claim
  approved, rejects every competing pending claim, and rewrites the profile. The profile
  gets `userId` = claimant and `identityType: "business"`, loses `claimable` and `source`,
  and its revision goes up by one. Public data such as name, contacts and Activity Areas
  stays unchanged. Its provenance is kept in the ledger and the audit.
- The claimant must be signed in with a verified e-mail. The Worker reads that e-mail from
  the account, never from the request, and stores it on the claim so the reviewer can
  compare it with public CNPJ records. To approve, the reviewer must name how they confirmed
  control: `published_contact_call` or `cnpj_registry_match`.
- The decision rules live in `createBusinessClaims`
  (`packages/advertiser-identity/businessClaim.ts`), behind a `BusinessClaimStore` seam.
  The D1 adapter in `apps/api-worker/lib/db/classifiedsBusinessClaims.ts` only maps records.
- After commit, the Worker emits `business_claimed` with the new owner as the actor and
  e-mails each affected claimant. Neither effect can undo the commit.

## Alternatives and consequences

- A new record kind `claim`. Rejected: the kind `CHECK` in `classifieds_records` would
  require rebuilding the main production table. The existing `operation` and `retirement`
  kinds already use namespaces for scoped collections.
- A separate D1 table. Rejected: the transfer could no longer commit in the same
  transaction as the profile without extending the persistence contract.
- Storing the pending claim in the profile body. Rejected: it allows only one claimant, and
  the private CNPJ and e-mail would sit beside data that public reads map.

Costs:

- The admin queue scans the `business_claims` namespace. The new `RecordQuery.namespace`
  filter is served by the primary key order. Reconsider once pending ledgers number in the
  thousands.
- The CNPJ is public, so it proves nothing on its own; the decision relies on the reviewer's
  confirmation step. A photo as evidence and a dispute path after transfer are not decided
  here.

Acceptance of this record is not activation: the public entry stays behind the
`business-claim` flag until Beto approves exposure.
