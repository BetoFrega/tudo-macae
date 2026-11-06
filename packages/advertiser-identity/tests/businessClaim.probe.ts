import type { BusinessClaimLedger, ClaimedBusiness, createBusinessClaims } from "../businessClaim";
export async function run(module: {
  createBusinessClaims: typeof createBusinessClaims;
}) {
  let ledger: BusinessClaimLedger = { revision: 0, claims: [] };
  let business: ClaimedBusiness = { title: "Negócio", claimable: true };
  const claims = module.createBusinessClaims({
    store: {
      read: async () => ({ ledger, business }),
      transact: async (_id, change) => {
        const result = change(ledger, business);
        ledger = result.ledger;
        if (result.transfer) business = { ...business, claimable: false };
        return ledger;
      },
      listPending: async () => [{ businessId: "business", title: business.title, revision: ledger.revision, claims: ledger.claims }],
    },
    now: () => 1000, newId: () => "claim", notify: async () => {},
  });
  const owner = { id: "owner", admin: false, email: "owner@example.test", emailVerified: true };
  const admin = { id: "admin", admin: true };
  await claims.submit({ businessId: "business", actor: owner, responsibleName: "Ana", cnpj: "11222333000181" });
  await claims.readOwn({ businessId: "business", actor: owner });
  await claims.listPending({ actor: admin });
  await claims.review({ businessId: "business", claimId: "claim", expectedRevision: 1, operationId: "operation", actor: admin, outcome: "approved", verification: "published_contact_call" });
}
