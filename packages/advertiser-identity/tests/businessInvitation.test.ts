import { expect, test } from "vitest";
import { createBusinessInvitations, type BusinessInvitation, type BusinessInvitationMessage, type InvitedBusiness } from "../businessInvitation";

function fixture(options: { businesses?: Record<string, InvitedBusiness | null>; suppressed?: string[]; fail?: (message: BusinessInvitationMessage) => Error | undefined } = {}) {
  const invitations = new Map<string, BusinessInvitation>([
    ["cafe", { email: "dono@cafe.test", status: "pending", createdAt: 1, attempts: 0 }],
  ]);
  const businesses = options.businesses ?? { cafe: { title: "Café com Arte", claimable: true, claimPath: "/negocio/cafe/cafe-com-arte/reivindicar" } };
  const suppressed = new Set(options.suppressed ?? []);
  const sent: BusinessInvitationMessage[] = [];
  const saved: [string, BusinessInvitation][] = [];
  let tokens = 0;
  const invites = createBusinessInvitations({
    store: {
      pending: async limit => [...invitations].filter(([, invitation]) => invitation.status === "pending").slice(0, limit).map(([businessId, invitation]) => ({ businessId, invitation })),
      business: async id => businesses[id] ?? null,
      suppressed: async email => suppressed.has(email),
      save: async (id, invitation) => {
        invitations.set(id, invitation);
        saved.push([id, invitation]);
      },
      unsubscribe: async (token) => {
        const entry = [...invitations.values()].find(invitation => invitation.token === token);
        if (entry) suppressed.add(entry.email);
        return Boolean(entry);
      },
    },
    send: async (message) => {
      const error = options.fail?.(message);
      if (error) throw error;
      sent.push(message);
    },
    now: () => 100,
    newToken: () => `token-${++tokens}`,
  });
  return { invites, invitations, sent, saved, suppressed };
}

test("sends a pending invitation once with the claim page and an unsubscribe token", async () => {
  const { invites, invitations, sent, saved } = fixture();

  expect(await invites.sendDue(10)).toEqual({ sent: 1, failed: 0, skipped: 0 });
  expect(sent).toEqual([{ to: "dono@cafe.test", businessTitle: "Café com Arte", claimPath: "/negocio/cafe/cafe-com-arte/reivindicar", unsubscribeToken: "token-1" }]);
  // The token and the in-flight state are stored before the provider call, so the link always resolves.
  expect(saved[0]![1]).toMatchObject({ status: "sending", token: "token-1", attempts: 1 });
  expect(invitations.get("cafe")).toMatchObject({ status: "sent", sentAt: 100 });

  expect(await invites.sendDue(10)).toEqual({ sent: 0, failed: 0, skipped: 0 });
  expect(sent).toHaveLength(1);
});

test("skips a Business that was claimed or removed before its invitation went out", async () => {
  for (const business of [{ title: "Café com Arte", claimable: false, claimPath: "/x" }, null]) {
    const { invites, invitations, sent } = fixture({ businesses: { cafe: business } });

    expect(await invites.sendDue(10)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sent).toEqual([]);
    expect(invitations.get("cafe")).toMatchObject({ status: "skipped", skipReason: "not_claimable" });
  }
});

test("never writes to an address that unsubscribed", async () => {
  const { invites, invitations, sent } = fixture({ suppressed: ["dono@cafe.test"] });

  expect(await invites.sendDue(10)).toEqual({ sent: 0, failed: 0, skipped: 1 });
  expect(sent).toEqual([]);
  expect(invitations.get("cafe")).toMatchObject({ status: "skipped", skipReason: "suppressed" });
});

test("retries a failed send on later runs with the same token, then gives up", async () => {
  const { invites, invitations } = fixture({ fail: () => Object.assign(new Error("rejected"), { name: "E_RECIPIENT_SUPPRESSED" }) });

  expect(await invites.sendDue(10)).toEqual({ sent: 0, failed: 0, skipped: 0 });
  expect(invitations.get("cafe")).toMatchObject({ status: "pending", attempts: 1, token: "token-1", failureCode: "E_RECIPIENT_SUPPRESSED" });
  await invites.sendDue(10);
  expect(await invites.sendDue(10)).toEqual({ sent: 0, failed: 1, skipped: 0 });
  expect(invitations.get("cafe")).toMatchObject({ status: "failed", attempts: 3, token: "token-1" });
});

test("an unsubscribe suppresses the address the token was sent to", async () => {
  const { invites, suppressed } = fixture();
  await invites.sendDue(10);

  expect(await invites.unsubscribe("unknown")).toBe(false);
  expect(await invites.unsubscribe("token-1")).toBe(true);
  expect(suppressed.has("dono@cafe.test")).toBe(true);
});
