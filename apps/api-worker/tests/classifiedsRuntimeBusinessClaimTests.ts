import { expect, test } from "vitest";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { now, profile, save, adminActor, ownerActor, classifiedsDatabase } from "./classifiedsRuntimeHarness";

const claimable = () => {
  const { userId: _, ...body } = profile("business").body;
  return { kind: "profile", id: "business", body: { ...body, claimable: true, source: { url: "https://source.test/business", checkedAt: now } } };
};

test("a reviewed claim moves the claimable Business to its owner once, with audit and claim event", async () => {
  await save(claimable());
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const events: unknown[] = [];
  let sequence = 0;
  const dependencies = { persistence, correlationId: "claim", now: () => now, newId: () => `claim-${++sequence}`, recordOfferEvent: (event: unknown) => events.push(event) };
  const owner = createClassifiedsCapabilities({ ...dependencies, actor: ownerActor });
  const rival = createClassifiedsCapabilities({ ...dependencies, actor: { ...ownerActor, uid: "rival" } });
  const admin = createClassifiedsCapabilities({ ...dependencies, actor: adminActor });
  const submission = { businessId: "business", responsibleName: "Ana", cnpj: "11.222.333/0001-81", operationId: "submit" };

  expect(await owner.write("claims.submit", submission)).toEqual({ status: "pending", submittedAt: now });
  expect(await owner.write("claims.submit", submission)).toEqual({ status: "pending", submittedAt: now });
  await rival.write("claims.submit", { ...submission, operationId: "rival-submit" });
  await expect(owner.read("claims.pending", {})).rejects.toMatchObject({ outcome: "authorization" });
  const [pending] = await admin.read("claims.pending", {}) as { businessId: string; revision: number; claims: { id: string; claimantId: string; evidence: { cnpj: string } }[] }[];
  expect(pending).toMatchObject({ businessId: "business", title: "Negócio", revision: 2, claims: [{ claimantId: "owner", evidence: { cnpj: "11222333000181" } }, { claimantId: "rival" }] });

  const review = { businessId: "business", claimId: pending!.claims[0]!.id, expectedRevision: 2, operationId: "approve", outcome: "approved", verification: "published_contact_call" };
  expect(await admin.write("claims.review", review)).toEqual({ revision: 3, status: "approved" });
  expect(await admin.write("claims.review", review)).toEqual({ revision: 3, status: "approved" });

  const stored = await persistence.read("profile", "business");
  expect(stored?.body).toMatchObject({ userId: "owner", identityType: "business", revision: 2, updatedAt: now });
  expect(stored?.body).not.toHaveProperty("claimable");
  expect(stored?.body).not.toHaveProperty("source");
  expect(await owner.read("profiles.mine", null)).toEqual([expect.objectContaining({ id: "business" })]);
  expect(await rival.read("claims.own", { businessId: "business" })).toMatchObject({ claimable: false, claim: { status: "rejected" } });
  expect(await admin.read("claims.pending", {})).toEqual([]);
  expect(events).toEqual([{ name: "business_claimed", actorId: "owner", identityId: "business", identityType: "business" }]);
  const audits = await persistence.page({ kind: "audit", namespace: "business_claim_review" });
  expect(audits.items.map(item => item.body)).toEqual([expect.objectContaining({ actorId: "admin", claimantId: "owner", outcome: "approved", verification: "published_contact_call" })]);
});
