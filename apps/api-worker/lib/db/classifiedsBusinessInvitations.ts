import { createHash } from "node:crypto";
import { z } from "zod";
import { PersistenceConflict, type ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { asBody } from "@tudomacae/classifieds-persistence/records";
import { businessInvitationSchema, type BusinessInvitationStore } from "@tudomacae/advertiser-identity/businessInvitation";
import { businessClaimPath } from "@tudomacae/advertiser-identity/businessPresentation";
import { isClaimableAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import { allRecords, jsonValue, parseStored, profileData } from "./classifiedsSupport";

/**
 * Invitations are keyed by Business id. Operators load them straight into D1 as `pending`
 * (docs/agents/business-invitations.md), so the recipient list never enters the repository.
 */
export const businessInvitationNamespace = "business_invitations";
const tokenNamespace = "business_invitation_tokens";
const suppressionNamespace = "email_suppressions";
const tokenSchema = z.object({ businessId: z.string().min(1) });

/** Suppressions are keyed by a digest, so the unsubscribe list holds no readable address. */
function suppressionId(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function createClassifiedsBusinessInvitationStore(persistence: ClassifiedsPersistence): BusinessInvitationStore {
  return {
    async pending(limit) {
      const { items } = await allRecords(persistence, { kind: "operation", namespace: businessInvitationNamespace });
      return items
        .map(record => ({ businessId: record.id, invitation: parseStored(businessInvitationSchema, record.body) }))
        .filter(entry => entry.invitation.status === "pending")
        .sort((left, right) => left.invitation.createdAt - right.invitation.createdAt || left.businessId.localeCompare(right.businessId))
        .slice(0, limit);
    },
    async business(businessId) {
      const record = await persistence.read("profile", businessId);
      if (!record) return null;
      const profile = profileData(record);
      return { title: profile.title, claimable: isClaimableAdvertiserProfile(profile), claimPath: businessClaimPath({ id: businessId, title: profile.title }) };
    },
    async suppressed(email) {
      return Boolean(await persistence.read("operation", suppressionId(email), suppressionNamespace));
    },
    async save(businessId, invitation) {
      await persistence.transact(null, async (tx) => {
        await tx.read("operation", businessId, businessInvitationNamespace);
        tx.put({ kind: "operation", namespace: businessInvitationNamespace, id: businessId, body: asBody(jsonValue(invitation)) });
        if (invitation.token) {
          await tx.read("operation", invitation.token, tokenNamespace);
          tx.put({ kind: "operation", namespace: tokenNamespace, id: invitation.token, body: asBody({ businessId }) });
        }
        return null;
      });
    },
    async claim(businessId, previous, next) {
      try {
        return await persistence.transact(null, async (tx) => {
          const current = await tx.read("operation", businessId, businessInvitationNamespace);
          const stored = current && parseStored(businessInvitationSchema, current.body);
          if (stored?.status !== "pending" || stored.attempts !== previous.attempts) return false;
          // The guarded read makes an unsubscribe that commits first win over this claim.
          if (await tx.read("operation", suppressionId(stored.email), suppressionNamespace)) return false;
          tx.put({ kind: "operation", namespace: businessInvitationNamespace, id: businessId, body: asBody(jsonValue(next)) });
          await tx.read("operation", next.token!, tokenNamespace);
          tx.put({ kind: "operation", namespace: tokenNamespace, id: next.token!, body: asBody({ businessId }) });
          return true;
        }).then(committed => committed.value === true);
      }
      catch (error) {
        // A concurrent run changed the invitation between this run's read and commit.
        if (error instanceof PersistenceConflict) return false;
        throw error;
      }
    },
    async unsubscribe(token, at) {
      const tokenRecord = await persistence.read("operation", token, tokenNamespace);
      if (!tokenRecord) return false;
      const { businessId } = parseStored(tokenSchema, tokenRecord.body);
      const invitation = await persistence.read("operation", businessId, businessInvitationNamespace);
      if (!invitation) return false;
      const { email } = parseStored(businessInvitationSchema, invitation.body);
      const id = suppressionId(email);
      await persistence.transact(null, async (tx) => {
        if (await tx.read("operation", id, suppressionNamespace)) return null;
        tx.put({ kind: "operation", namespace: suppressionNamespace, id, body: asBody({ suppressedAt: at, source: "business_invitation" }) });
        return null;
      });
      return true;
    },
  };
}
