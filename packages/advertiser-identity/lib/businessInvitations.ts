import { z } from "zod";

/**
 * One e-mail invitation for the owner of a claimable Business to take over its page.
 * `sending` is written before the provider call, so an interrupted send is never repeated.
 */
export const businessInvitationSchema = z.object({
  email: z.email(),
  status: z.enum(["pending", "sending", "sent", "failed", "skipped"]),
  createdAt: z.number().int(),
  attempts: z.number().int().nonnegative().default(0),
  token: z.string().min(1).optional(),
  sentAt: z.number().int().optional(),
  failureCode: z.string().optional(),
  skipReason: z.enum(["not_claimable", "suppressed"]).optional(),
});
export type BusinessInvitation = z.infer<typeof businessInvitationSchema>;

export interface InvitedBusiness {
  title: string;
  claimable: boolean;
  /** Site path of the Business's claim page. */
  claimPath: string;
}

export interface BusinessInvitationStore {
  /** Invitations still waiting for their first successful send, oldest first. */
  pending(limit: number): Promise<{ businessId: string; invitation: BusinessInvitation }[]>;
  business(businessId: string): Promise<InvitedBusiness | null>;
  /** Whether the address asked to stop receiving invitations. */
  suppressed(email: string): Promise<boolean>;
  save(businessId: string, invitation: BusinessInvitation): Promise<void>;
  /** Stores `next` only if the invitation is still the `pending` one read as `previous`, its address is not suppressed and its Business is still claimable; false sends nothing. */
  claim(businessId: string, previous: BusinessInvitation, next: BusinessInvitation): Promise<boolean>;
  /** Suppresses the address the token was sent to; false for an unknown token. */
  unsubscribe(token: string, at: number): Promise<boolean>;
}

export interface BusinessInvitationMessage {
  to: string;
  businessTitle: string;
  claimPath: string;
  unsubscribeToken: string;
}

export interface BusinessInvitationRun {
  sent: number;
  /** Provider failures that will be retried on a later run. */
  retrying: number;
  failed: number;
  skipped: number;
}

/** Sends due invitations one at a time; each provider failure is retried on a later run up to `maxAttempts`. */
export function createBusinessInvitations(dependencies: {
  store: BusinessInvitationStore;
  send(message: BusinessInvitationMessage): Promise<void>;
  now(): number;
  newToken(): string;
  maxAttempts?: number;
}) {
  const { store, now } = dependencies;
  const maxAttempts = dependencies.maxAttempts ?? 3;

  async function skip(businessId: string, invitation: BusinessInvitation, skipReason: NonNullable<BusinessInvitation["skipReason"]>) {
    await store.save(businessId, { ...invitation, status: "skipped", skipReason });
  }

  /** The token and the `sending` state are stored before the provider call, so every link resolves and nothing is sent twice. */
  async function deliver(businessId: string, invitation: BusinessInvitation, business: InvitedBusiness): Promise<"sent" | "failed" | "retrying" | "taken"> {
    const sending: BusinessInvitation = { ...invitation, status: "sending", token: invitation.token ?? dependencies.newToken(), attempts: invitation.attempts + 1 };
    if (!(await store.claim(businessId, invitation, sending))) return "taken";
    try {
      await dependencies.send({ to: sending.email, businessTitle: business.title, claimPath: business.claimPath, unsubscribeToken: sending.token! });
    }
    catch (error) {
      const failureCode = error instanceof Error && error.name !== "Error" ? error.name : "send_failed";
      const exhausted = sending.attempts >= maxAttempts;
      await store.save(businessId, { ...sending, status: exhausted ? "failed" : "pending", failureCode });
      return exhausted ? "failed" : "retrying";
    }
    await store.save(businessId, { ...sending, status: "sent", sentAt: now() });
    return "sent";
  }

  return {
    async sendDue(limit: number): Promise<BusinessInvitationRun> {
      const run: BusinessInvitationRun = { sent: 0, retrying: 0, failed: 0, skipped: 0 };
      for (const { businessId, invitation } of await store.pending(limit)) {
        const business = await store.business(businessId);
        if (!business?.claimable) {
          await skip(businessId, invitation, "not_claimable");
          run.skipped++;
          continue;
        }
        if (await store.suppressed(invitation.email)) {
          await skip(businessId, invitation, "suppressed");
          run.skipped++;
          continue;
        }
        const outcome = await deliver(businessId, invitation, business);
        if (outcome !== "taken") run[outcome]++;
      }
      return run;
    },
    unsubscribe(token: string) {
      return store.unsubscribe(token, now());
    },
  };
}
