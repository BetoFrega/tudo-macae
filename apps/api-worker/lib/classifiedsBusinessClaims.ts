import { z } from "zod";
import { createBusinessClaims } from "@tudomacae/advertiser-identity/businessClaim";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { jsonValue } from "./db/classifiedsSupport";
import { createClassifiedsBusinessClaimStore } from "./db/classifiedsBusinessClaims";
import type { ClassifiedsActor } from "./classifiedsCapabilities";

const operationId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u);
const reference = z.object({ businessId: z.string().min(1).max(128) });
const submission = reference.extend({ operationId, responsibleName: z.unknown(), cnpj: z.unknown(), note: z.unknown().optional() });
const review = reference.extend({
  operationId, claimId: z.string().min(1).max(128), expectedRevision: z.number().int().nonnegative(),
  outcome: z.unknown(), verification: z.unknown().optional(), reason: z.unknown().optional(),
});

/** Every operation requires a signed-in actor; listing and reviewing also require an administrator. */
export function createClassifiedsBusinessClaims(dependencies: {
  persistence: ClassifiedsPersistence; now(): number; newId(): string;
  claimed?: (event: { businessId: string; ownerId: string }) => void;
}) {
  function claims(intent?: Parameters<typeof createClassifiedsBusinessClaimStore>[0]["intent"]) {
    return createBusinessClaims({
      store: createClassifiedsBusinessClaimStore({ persistence: dependencies.persistence, now: dependencies.now, ...(intent ? { intent } : {}) }),
      now: dependencies.now, newId: dependencies.newId, ...(dependencies.claimed ? { claimed: dependencies.claimed } : {}),
    });
  }
  const actorOf = (actor: ClassifiedsActor) => ({ id: actor.uid, admin: actor.admin });
  return {
    read(operation: string, input: unknown, actor: ClassifiedsActor) {
      if (operation === "claims.pending") return claims().listPending({ actor: actorOf(actor) });
      return claims().readOwn({ ...reference.parse(input), actor: actorOf(actor) });
    },
    write(operation: string, input: unknown, actor: ClassifiedsActor) {
      if (operation === "claims.submit") {
        const command = submission.parse(input);
        return claims({ actorId: actor.uid, key: command.operationId, operation, input: jsonValue(command) }).submit({ ...command, actor: actorOf(actor) });
      }
      const command = review.parse(input);
      return claims({ actorId: actor.uid, key: command.operationId, operation, input: jsonValue(command) }).review({ ...command, actor: actorOf(actor) });
    },
  };
}
