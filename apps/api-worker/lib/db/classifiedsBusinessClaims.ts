import { createHash } from "node:crypto";
import type { ClassifiedsPersistence, OperationIntent, StoredRecord } from "@tudomacae/classifieds-persistence";
import { asBody } from "@tudomacae/classifieds-persistence/records";
import { advertiserProfileAuditRetentionMs } from "@tudomacae/advertiser-identity/administration";
import { businessClaimLedgerSchema, type BusinessClaimLedger, type BusinessClaimStore, type ClaimedBusiness } from "@tudomacae/advertiser-identity/businessClaim";
import { isClaimableAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import { allRecords, jsonValue, parseStored, profileData } from "./classifiedsSupport";

/** One ledger per Business, keyed by its id, holds every claim and review it ever received. */
const ledgerNamespace = "business_claims";
const auditNamespace = "business_claim_review";
const empty: BusinessClaimLedger = { revision: 0, claims: [] };

function ledgerOf(record: StoredRecord | null): BusinessClaimLedger {
  return record ? parseStored(businessClaimLedgerSchema, record.body) : empty;
}

function businessOf(record: StoredRecord | null): ClaimedBusiness | null {
  if (!record) return null;
  const profile = profileData(record);
  return { title: profile.title, claimable: isClaimableAdvertiserProfile(profile) };
}

/** The claimed Business keeps its public data; claim provenance stays in the ledger and audit. */
function ownedBody(record: StoredRecord, ownerId: string, now: number) {
  const { claimable: _claimable, source: _source, ...body } = record.body;
  const revision = typeof body.revision === "number" ? body.revision : 1;
  return asBody({ ...body, userId: ownerId, identityType: "business", revision: revision + 1, updatedAt: now });
}

export function createClassifiedsBusinessClaimStore(dependencies: { persistence: ClassifiedsPersistence; now(): number; intent?: OperationIntent }): BusinessClaimStore {
  const { persistence, intent } = dependencies;
  return {
    async read(businessId) {
      return persistence.snapshot(async (reader) => {
        const [ledger, profile] = await Promise.all([reader.read("operation", businessId, ledgerNamespace), reader.read("profile", businessId)]);
        return { ledger: ledgerOf(ledger), business: businessOf(profile) };
      });
    },
    async transact(businessId, change) {
      const committed = await persistence.transact(intent ?? null, async (tx) => {
        const [ledgerRecord, profile] = await Promise.all([tx.read("operation", businessId, ledgerNamespace), tx.read("profile", businessId)]);
        const previous = ledgerOf(ledgerRecord);
        const result = change(previous, businessOf(profile));
        if (result.ledger.revision !== previous.revision)
          tx.put({ kind: "operation", namespace: ledgerNamespace, id: businessId, body: asBody(jsonValue(result.ledger)) });
        const now = dependencies.now();
        if (result.transfer) tx.put({ ...profile!, body: ownedBody(profile!, result.transfer.ownerId, now) });
        if (result.audit) {
          const id = createHash("sha256").update(JSON.stringify([result.audit.actorId, result.audit.operationId])).digest("hex");
          await tx.read("audit", id, auditNamespace);
          tx.put({ kind: "audit", namespace: auditNamespace, id, body: asBody(jsonValue({ ...result.audit, createdAt: now, expiresAt: now + advertiserProfileAuditRetentionMs })) });
        }
        return jsonValue(result.ledger);
      });
      return parseStored(businessClaimLedgerSchema, committed.value);
    },
    async listPending() {
      const { items } = await allRecords(persistence, { kind: "operation", namespace: ledgerNamespace });
      const open = items
        .map(record => ({ businessId: record.id, ledger: ledgerOf(record) }))
        .map(({ businessId, ledger }) => ({ businessId, revision: ledger.revision, claims: ledger.claims.filter(claim => claim.status === "pending") }))
        .filter(entry => entry.claims.length > 0);
      const titles = await Promise.all(open.map(async entry => businessOf(await persistence.read("profile", entry.businessId))?.title ?? ""));
      return open
        .map((entry, index) => ({ ...entry, title: titles[index]! }))
        .sort((left, right) => left.claims[0]!.submittedAt - right.claims[0]!.submittedAt);
    },
  };
}
