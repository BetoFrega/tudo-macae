import { z } from "zod";
import type { CatalogFlagDecision } from "./offeringCatalog";

export const offeringCatalogFlagKey = "business-offering-catalog";
const evaluation = z.object({ flags: z.record(z.string(), z.object({ enabled: z.boolean(), reason: z.object({ code: z.string().optional() }).optional() })) });
type OfferingFlagDependencies = {
  host?: string;
  token?: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  observe?: (outcome: CatalogFlagDecision, durationMs: number) => void;
};

function decisionOutcome(decision: z.infer<typeof evaluation>["flags"][string] | undefined): CatalogFlagDecision {
  if (!decision) return "unavailable";
  if (decision.enabled) return "enabled";
  return decision.reason?.code === "no_condition_match" ? "outside_audience" : "disabled";
}

async function evaluateFlag(dependencies: OfferingFlagDependencies, businessId: string): Promise<CatalogFlagDecision> {
  if (!dependencies.host || !dependencies.token) return "unavailable";
  const url = new URL("/flags?v=2", dependencies.host);
  if (url.protocol !== "https:") return "unavailable";
  const response = await dependencies.fetch(url.toString(), { method: "POST", cache: "no-store", signal: AbortSignal.timeout(1500),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: dependencies.token, distinct_id: "", person_properties: { business_id: businessId }, flag_keys_to_evaluate: [offeringCatalogFlagKey] }),
  });
  if (!response.ok) return "unavailable";
  const parsed = evaluation.safeParse(await response.json());
  return decisionOutcome(parsed.success ? parsed.data.flags[offeringCatalogFlagKey] : undefined);
}

export function createOfferingFlag(dependencies: OfferingFlagDependencies) {
  return async (businessId: string): Promise<CatalogFlagDecision> => {
    const started = performance.now();
    let outcome: CatalogFlagDecision;
    try {
      outcome = await evaluateFlag(dependencies, businessId);
    }
    catch {
      outcome = "unavailable";
    }
    dependencies.observe?.(outcome, performance.now() - started);
    return outcome;
  };
}
