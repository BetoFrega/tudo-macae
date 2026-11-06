import { expect, test } from "vitest";
import {
  BusinessClaimError, competingClaimApprovedReason, createBusinessClaims, maxPendingClaimsPerBusiness, normalizeCnpj,
  type BusinessClaimAudit, type BusinessClaimLedger, type ClaimedBusiness,
} from "../businessClaim";

const validCnpj = "11.222.333/0001-81";
const owner = { id: "owner", admin: false };
const rival = { id: "rival", admin: false };
const admin = { id: "admin", admin: true };

function fixture() {
  let ledger: BusinessClaimLedger = { revision: 0, claims: [] };
  let business: ClaimedBusiness | null = { title: "Café com Arte", claimable: true };
  const audits: BusinessClaimAudit[] = [];
  const claimed: unknown[] = [];
  let sequence = 0;
  const claims = createBusinessClaims({
    store: {
      read: async () => ({ ledger, business }),
      transact: async (_id, change) => {
        const result = change(ledger, business);
        ledger = result.ledger;
        if (result.transfer) business = { ...business!, claimable: false };
        if (result.audit) audits.push(result.audit);
        return ledger;
      },
      listPending: async () => [{ businessId: "business", title: business!.title, revision: ledger.revision, claims: ledger.claims.filter(claim => claim.status === "pending") }],
    },
    now: () => 1_000,
    newId: () => `claim-${++sequence}`,
    claimed: event => claimed.push(event),
  });
  const submit = (actor = owner) => claims.submit({ businessId: "business", actor, responsibleName: "Ana", cnpj: validCnpj });
  return { claims, audits, claimed, submit, ledger: () => ledger, business: () => business, setBusiness: (value: ClaimedBusiness | null) => {
    business = value;
  } };
}

test.each([
  ["11.222.333/0001-81", "11222333000181"],
  ["11222333000181", "11222333000181"],
  ["11.222.333/0001-80", null],
  ["11111111111111", null],
  ["1122233300018", null],
])("CNPJ %s is accepted only with valid check digits", (value, expected) => {
  expect(normalizeCnpj(value)).toBe(expected);
});

test("an owner's claim waits for review and repeating it keeps the same request", async () => {
  const f = fixture();
  expect(await f.submit()).toEqual({ status: "pending", submittedAt: 1_000 });
  await f.submit();

  expect(f.ledger().claims).toHaveLength(1);
  expect(f.ledger().claims[0]).toMatchObject({ claimantId: "owner", evidence: { kind: "cnpj", cnpj: "11222333000181" } });
  expect(f.business()).toEqual({ title: "Café com Arte", claimable: true });
  expect(await f.claims.readOwn({ businessId: "business", actor: owner })).toEqual({ claimable: true, claim: { status: "pending", submittedAt: 1_000 } });
});

test("an invalid claim names each field to fix", async () => {
  const f = fixture();
  const error = await f.claims.submit({ businessId: "business", actor: owner, responsibleName: " ", cnpj: "123", note: "x".repeat(501) }).catch(caught => caught);

  expect(error).toBeInstanceOf(BusinessClaimError);
  expect(error).toMatchObject({ outcome: "validation" });
  expect(Object.keys(error.fieldErrors).sort()).toEqual(["cnpj", "note", "responsibleName"]);
});

test("a Business already owned or missing cannot be claimed", async () => {
  const f = fixture();
  f.setBusiness({ title: "Café com Arte", claimable: false });
  await expect(f.submit()).rejects.toMatchObject({ outcome: "not_claimable" });
  f.setBusiness(null);
  await expect(f.submit()).rejects.toMatchObject({ outcome: "not_claimable" });
});

test("approval transfers the Business, settles the competing claim and is audited", async () => {
  const f = fixture();
  await f.submit();
  await f.submit(rival);
  const [ownerClaim, rivalClaim] = f.ledger().claims;

  const result = await f.claims.review({ businessId: "business", claimId: ownerClaim!.id, expectedRevision: 2, operationId: "op-1", actor: admin, outcome: "approved", verification: "published_contact_call" });

  expect(result).toEqual({ revision: 3, status: "approved" });
  expect(f.business()?.claimable).toBe(false);
  expect(f.claimed).toEqual([{ businessId: "business", ownerId: "owner" }]);
  expect(f.audits).toEqual([expect.objectContaining({ actorId: "admin", claimantId: "owner", outcome: "approved", verification: "published_contact_call", rejectedCompetingClaims: [rivalClaim!.id], operationId: "op-1" })]);
  expect(await f.claims.readOwn({ businessId: "business", actor: rival })).toEqual({ claimable: false, claim: { status: "rejected", submittedAt: 1_000, reason: competingClaimApprovedReason } });
});

test("a rejection tells the claimant why and lets them try again", async () => {
  const f = fixture();
  await f.submit();
  const claimId = f.ledger().claims[0]!.id;
  await f.claims.review({ businessId: "business", claimId, expectedRevision: 1, operationId: "op-1", actor: admin, outcome: "rejected", reason: "O CNPJ é de outra empresa." });

  expect(await f.claims.readOwn({ businessId: "business", actor: owner })).toMatchObject({ claim: { status: "rejected", reason: "O CNPJ é de outra empresa." } });
  expect(f.business()?.claimable).toBe(true);
  expect(f.claimed).toEqual([]);
  await f.submit();
  expect(f.ledger().claims.map(claim => claim.status)).toEqual(["rejected", "pending"]);
});

test("a review needs an administrator, a confirmation method or reason, and the current revision", async () => {
  const f = fixture();
  await f.submit();
  const claimId = f.ledger().claims[0]!.id;
  const review = { businessId: "business", claimId, expectedRevision: 1, operationId: "op-1" };

  await expect(f.claims.review({ ...review, actor: owner, outcome: "approved", verification: "published_contact_call" })).rejects.toMatchObject({ outcome: "authorization" });
  await expect(f.claims.review({ ...review, actor: admin, outcome: "approved" })).rejects.toMatchObject({ outcome: "validation", fieldErrors: { verification: expect.any(String) } });
  await expect(f.claims.review({ ...review, actor: admin, outcome: "rejected", reason: "" })).rejects.toMatchObject({ outcome: "validation", fieldErrors: { reason: expect.any(String) } });
  await expect(f.claims.review({ ...review, expectedRevision: 0, actor: admin, outcome: "approved", verification: "cnpj_registry_match" })).rejects.toMatchObject({ outcome: "conflict" });
  await expect(f.claims.listPending({ actor: owner })).rejects.toMatchObject({ outcome: "authorization" });
  expect(f.business()?.claimable).toBe(true);
});

test("an approval is refused once the Business stopped being claimable", async () => {
  const f = fixture();
  await f.submit();
  f.setBusiness({ title: "Café com Arte", claimable: false });

  await expect(f.claims.review({ businessId: "business", claimId: f.ledger().claims[0]!.id, expectedRevision: 1, operationId: "op-1", actor: admin, outcome: "approved", verification: "cnpj_registry_match" }))
    .rejects.toMatchObject({ outcome: "not_claimable" });
});

test("a flooded Business stops accepting new claims until the dispute is reviewed", async () => {
  const f = fixture();
  for (let index = 0; index < maxPendingClaimsPerBusiness; index++) await f.submit({ id: `claimant-${index}`, admin: false });

  await expect(f.submit()).rejects.toMatchObject({ outcome: "limit" });
});
