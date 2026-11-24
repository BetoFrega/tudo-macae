import { expect, test } from "vitest";
import { createBusinessInvitations, type BusinessInvitationMessage } from "@tudomacae/advertiser-identity/businessInvitation";
import { createClassifiedsPersistence, createClassifiedsCapabilities } from "../classifieds";
import { createClassifiedsBusinessInvitationStore } from "../lib/db/classifiedsBusinessInvitations";
import { businessInvitationMail } from "../lib/businessInvitationMail";
import { businessInvitationsReleased } from "../lib/businessClaimRelease";
import { now, profile, save, classifiedsDatabase } from "./classifiedsRuntimeHarness";

const claimable = (id: string, title: string) => {
  const { userId: _, ...body } = profile(id).body;
  return { kind: "profile", id, body: { ...body, title, claimable: true, source: { url: `https://source.test/${id}`, checkedAt: now } } };
};

/** The operator load statement from docs/agents/business-invitations.md. */
async function load(businessId: string, email: string) {
  await (await classifiedsDatabase()).prepare(`INSERT INTO classifieds_records (kind, namespace, id, body, version)
    VALUES ('operation', 'business_invitations', ?1, json_object('email', ?2, 'status', 'pending', 'createdAt', ?3, 'attempts', 0), lower(hex(randomblob(16))))
    ON CONFLICT(kind, namespace, id) DO NOTHING`).bind(businessId, email, now).run();
}

test("loaded invitations go out once, link the claim page, and an unsubscribe stops the address", async () => {
  await save(claimable("cafe", "Café com Arte"), claimable("bar", "Bar do Zé"), profile("owned"));
  await load("cafe", "dono@cafe.test");
  await load("owned", "dono@owned.test");
  await load("bar", "dono@cafe.test");
  const persistence = createClassifiedsPersistence({ database: await classifiedsDatabase() });
  const sent: BusinessInvitationMessage[] = [];
  const invitations = createBusinessInvitations({
    store: createClassifiedsBusinessInvitationStore(persistence),
    send: async (message) => {
      sent.push(message);
    },
    now: () => now,
    newToken: () => `token-${sent.length + 1}`,
  });

  expect(await invitations.sendDue(1)).toEqual({ sent: 1, retrying: 0, failed: 0, skipped: 0 });
  expect(sent.map(message => [message.to, message.claimPath])).toEqual([["dono@cafe.test", "/negocio/bar/bar-do-ze/reivindicar"]]);
  const mail = businessInvitationMail(sent[0]!, "https://tudomacae.test");
  expect(mail.text).toContain("https://tudomacae.test/negocio/bar/bar-do-ze/reivindicar");
  expect(mail.text).toContain("https://tudomacae.test/convites/descadastrar/token-1");

  // A run that read "bar" before it went out loses the claim instead of sending it again.
  const stale = { email: "dono@cafe.test", status: "pending" as const, createdAt: now, attempts: 0 };
  expect(await createClassifiedsBusinessInvitationStore(persistence).claim("bar", stale, { ...stale, status: "sending", attempts: 1, token: "late" })).toBe(false);
  // A run that read "owned" as claimable before its owner was approved loses the claim.
  const owned = { ...stale, email: "dono@owned.test" };
  expect(await createClassifiedsBusinessInvitationStore(persistence).claim("owned", owned, { ...owned, status: "sending", attempts: 1, token: "owned" })).toBe(false);

  // A reload never resets an invitation that already went out.
  await load("bar", "dono@cafe.test");
  const anonymous = createClassifiedsCapabilities({ persistence, correlationId: "unsubscribe", now: () => now });
  expect(await anonymous.write("invitations.unsubscribe", { token: "unknown" })).toEqual({ unsubscribed: false });
  expect(await anonymous.write("invitations.unsubscribe", { token: "token-1" })).toEqual({ unsubscribed: true });
  // A run that checked the address before the unsubscribe committed still loses the claim.
  const cafe = { email: "dono@cafe.test", status: "pending" as const, createdAt: now, attempts: 0 };
  expect(await createClassifiedsBusinessInvitationStore(persistence).claim("cafe", cafe, { ...cafe, status: "sending", attempts: 1, token: "raced" })).toBe(false);

  expect(await invitations.sendDue(10)).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 2 });
  expect(sent).toHaveLength(1);
  const stored = await persistence.page({ kind: "operation", namespace: "business_invitations" });
  expect(Object.fromEntries(stored.items.map(item => [item.id, [item.body.status, item.body.skipReason]]))).toEqual({
    bar: ["sent", undefined], cafe: ["skipped", "suppressed"], owned: ["skipped", "not_claimable"],
  });
  const suppressions = await persistence.page({ kind: "operation", namespace: "email_suppressions" });
  expect(JSON.stringify(suppressions.items)).not.toContain("dono@cafe.test");
});

const flags = (values: Record<string, boolean | "error">) => ({
  getBooleanDetails: async (key: string, fallback: boolean) =>
    values[key] === "error" ? { value: fallback, errorCode: "GENERAL" } : { value: values[key] ?? fallback },
});

test("invitations go out only while both the claim and the invitation flags are on", async () => {
  expect(await businessInvitationsReleased(flags({ "business-claim": true, "business-invitation-email": true }))).toBe(true);
  expect(await businessInvitationsReleased(flags({ "business-claim": false, "business-invitation-email": true }))).toBe(false);
  expect(await businessInvitationsReleased(flags({ "business-claim": true }))).toBe(false);
  expect(await businessInvitationsReleased(flags({ "business-claim": true, "business-invitation-email": "error" }))).toBe(false);
  expect(await businessInvitationsReleased(undefined)).toBe(false);
});
