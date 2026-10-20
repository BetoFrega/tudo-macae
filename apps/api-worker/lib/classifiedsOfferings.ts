import { z } from "zod";
import { createOfferingCatalog, type CatalogFlagDecision } from "@tudomacae/advertiser-identity/offeringCatalog";
import type { ClassifiedsPersistence } from "@tudomacae/classifieds-persistence";
import { jsonValue } from "./db/classifiedsSupport";
import { createClassifiedsOfferingStore } from "./db/classifiedsOfferings";
import type { ClassifiedsActor } from "./classifiedsCapabilities";

const reference = z.object({ businessId: z.string().min(1).max(128) });
const common = reference.extend({ expectedRevision: z.number().int().nonnegative(), operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u) });
export function createClassifiedsOfferings(dependencies: {
  persistence: ClassifiedsPersistence; flag?: (id: string) => Promise<CatalogFlagDecision>;
  observe?: (event: { operation: "flag" | "public_policy"; outcome: string; durationMs: number }) => void;
  now(): number; newId(): string; isPublicBusiness(id: string): Promise<boolean>;
}) {
  async function flag(id: string): Promise<CatalogFlagDecision> {
    const started = performance.now();
    let outcome: CatalogFlagDecision;
    try {
      outcome = await dependencies.flag?.(id) ?? "unavailable";
    }
    catch { outcome = "unavailable"; }
    dependencies.observe?.({ operation: "flag", outcome, durationMs: performance.now() - started });
    return outcome;
  }
  function catalog(intent?: Parameters<typeof createClassifiedsOfferingStore>[0]["intent"]) {
    const time = dependencies.now();
    const id = dependencies.newId();
    return createOfferingCatalog({ store: createClassifiedsOfferingStore({ persistence: dependencies.persistence, ...(intent ? { intent } : {}) }),
      flag, isPublicBusiness: dependencies.isPublicBusiness, now: () => time, newId: () => id,
      publicOutcome: outcome => dependencies.observe?.({ operation: "public_policy", outcome, durationMs: 0 }) });
  }
  return {
    async read(operation: string, input: unknown, actor?: ClassifiedsActor) {
      const value = reference.parse(input);
      if (operation === "offerings.available") return flag(value.businessId).catch(() => "unavailable" as const);
      if (operation === "offerings.public") return catalog().readPublic(value.businessId);
      return catalog().readManagement({ ...value, actor: { id: actor!.uid, admin: actor!.admin } });
    },
    async write(operation: string, input: unknown, actor: ClassifiedsActor) {
      const shape = operation === "offerings.save"
        ? common.extend({ item: z.unknown() })
        : operation === "offerings.visibility"
          ? common.extend({ itemId: z.string(), visible: z.boolean() })
          : common.extend({ enabled: z.boolean() });
      const command = shape.parse(input);
      const offeringCatalog = catalog({ actorId: actor.uid, key: command.operationId, operation, input: jsonValue(command) });
      const value = { ...command, actor: { id: actor.uid, admin: actor.admin } };
      if (operation === "offerings.save") return offeringCatalog.saveItem({ ...value, item: z.object({ item: z.unknown() }).parse(command).item });
      if (operation === "offerings.visibility") return offeringCatalog.setVisibility({ ...value, ...z.object({ itemId: z.string(), visible: z.boolean() }).parse(command) });
      return offeringCatalog.setEnablement({ ...value, ...z.object({ enabled: z.boolean() }).parse(command) });
    },
  };
}
