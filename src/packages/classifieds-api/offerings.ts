import { AsyncLocalStorage } from "node:async_hooks";
import { offeringFailureCause } from "@tudomacae/advertiser-identity/offeringDiagnostics";
import { OfferingCatalogError, type CatalogFlagDecision, type createOfferingCatalog } from "@tudomacae/advertiser-identity/offeringCatalog";
import { route } from "./route";
type Catalog = ReturnType<typeof createOfferingCatalog>;

const context = new AsyncLocalStorage<{ correlationId: string; businessId: string; requestId?: string }>();
function observe(operation: string, outcome: string, durationMs: number, correlationId: string, cause?: string) {
  console.info(JSON.stringify({ event: "business_offering_catalog_operation", service: "business-offering-catalog", environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production", release: process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown", operation, outcome, durationMs, correlationId, ...(context.getStore()?.requestId ? { requestId: context.getStore()?.requestId } : {}), ...(context.getStore()?.businessId ? { businessId: context.getStore()?.businessId } : {}), ...(cause ? { cause } : {}) }));
}
async function observeOfferingCatalogOperation<T>(name: string, execute: () => Promise<T>, correlationId: string = crypto.randomUUID(), businessId = "", requestId?: string) {
  const started = performance.now();
  const parent = context.getStore();
  const scope = /^[a-zA-Z0-9_-]{1,128}$/u.test(businessId) ? businessId : "invalid";
  const operationContext = { ...parent ?? { correlationId, businessId: scope }, ...(requestId ? { requestId } : {}) };
  try {
    const result = await context.run(operationContext, execute);
    context.run(operationContext, () => observe(name, result === null ? "not_public" : "success", performance.now() - started, parent?.correlationId ?? correlationId));
    return result;
  }
  catch (error) {
    if (error instanceof OfferingCatalogError || !parent) {
      context.run(operationContext, () => observe(name, error instanceof OfferingCatalogError ? error.outcome : "technical_failure", performance.now() - started, parent?.correlationId ?? correlationId, error instanceof OfferingCatalogError ? undefined : offeringFailureCause(error)));
    }
    throw error;
  }
}
export function observeOfferingCatalogAction<T>(businessId: string, correlationId: string, execute: () => Promise<T>) {
  return observeOfferingCatalogOperation("mutation_action", execute, correlationId, /^[a-zA-Z0-9_-]{1,128}$/u.test(businessId) ? businessId : "invalid");
}

const observeInput = <T>(operation: string) => (execute: () => Promise<T>, [input]: [{ businessId: string }], requestId: string) => observeOfferingCatalogOperation(operation, execute, requestId, input.businessId, requestId);
const observeReference = <T>(operation: string) => (execute: () => Promise<T>, [businessId]: [string], requestId: string) => observeOfferingCatalogOperation(operation, execute, requestId, businessId, requestId);
export const offeringCatalog = {
  readManagement: route<Catalog["readManagement"]>("offerings.management", input => ({ businessId: input.businessId }), false, observeInput("management_read")),
  readPublic: route<Catalog["readPublic"]>("offerings.public", businessId => ({ businessId }), false, observeReference("public_read")),
  saveItem: route<Catalog["saveItem"]>("offerings.save", input => ({ businessId: input.businessId, expectedRevision: input.expectedRevision, item: input.item, operationId: crypto.randomUUID() }), true, observeInput("save")),
  setVisibility: route<Catalog["setVisibility"]>("offerings.visibility", input => ({ businessId: input.businessId, expectedRevision: input.expectedRevision, itemId: input.itemId, visible: input.visible, operationId: crypto.randomUUID() }), true, observeInput("visibility")),
  setEnablement: route<Catalog["setEnablement"]>("offerings.enablement", input => ({ businessId: input.businessId, expectedRevision: input.expectedRevision, enabled: input.enabled, operationId: input.operationId }), true, observeInput("enablement")),
};
export const offeringCatalogAvailable = route<(businessId: string) => Promise<CatalogFlagDecision>>("offerings.available", businessId => ({ businessId }), false, observeReference("flag_entry"));
