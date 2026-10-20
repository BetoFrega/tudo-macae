import { createHash } from "node:crypto";
import type { ClassifiedsPersistence, OperationIntent } from "@tudomacae/classifieds-persistence";
import { asBody } from "@tudomacae/classifieds-persistence/records";
import { offeringCatalogStateSchema, type OfferingCatalogStore } from "@tudomacae/advertiser-identity/offeringCatalog";
import { isClaimableAdvertiserProfile, isOwnedAdvertiserProfile } from "@tudomacae/advertiser-identity/model";
import { jsonValue, parseStored, profileData } from "./classifiedsSupport";

export function createClassifiedsOfferingStore(dependencies: { persistence: ClassifiedsPersistence; intent?: OperationIntent }): OfferingCatalogStore {
  const { persistence, intent } = dependencies;
  const state = (body: unknown) => body === undefined ? { enabled: false, revision: 0, items: [] } : parseStored(offeringCatalogStateSchema, body);
  return {
    async read(businessId) { return state((await persistence.read("catalog", businessId))?.body); },
    async transact(businessId, change) {
      const committed = await persistence.transact(intent ?? null, async (tx) => {
        const [catalog, record] = await Promise.all([tx.read("catalog", businessId), tx.read("profile", businessId)]);
        const profile = record ? profileData(record) : null;
        const identity = profile && (isOwnedAdvertiserProfile(profile) || isClaimableAdvertiserProfile(profile))
          ? { ...(profile.userId ? { ownerId: profile.userId } : {}), claimable: isClaimableAdvertiserProfile(profile) }
          : null;
        const previous = state(catalog?.body);
        const result = change(previous, identity);
        if (result.state.revision !== previous.revision) tx.put({ kind: "catalog", id: businessId, body: asBody(jsonValue(result.state)) });
        if (result.audit) {
          const id = createHash("sha256").update(JSON.stringify([result.audit.actorId, result.audit.operationId])).digest("hex");
          await tx.read("audit", id, "business_catalog_enablement_audit");
          tx.put({ kind: "audit", namespace: "business_catalog_enablement_audit", id, body: asBody(jsonValue(result.audit)) });
        }
        return jsonValue(result.state);
      });
      return parseStored(offeringCatalogStateSchema, committed.value);
    },
  };
}
