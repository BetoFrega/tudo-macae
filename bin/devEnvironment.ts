import { readFileSync } from "node:fs";
import ts from "typescript";
import { CANONICAL_APP_ORIGIN } from "./appOrigin.ts";

/**
 * Browser analytics settings `next dev` takes from the production web Worker.
 * `instrumentation-client.ts` throws outside production builds when either is
 * missing, so dropping one breaks every page of `pnpm run dev`.
 */
const PRODUCTION_ANALYTICS_VARIABLES = [
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
] as const;

/** Plain variables `wrangler.web.jsonc` gives the production web Worker. */
export function productionWebWorkerVariables(
  webWorkerConfig = readFileSync(new URL("../wrangler.web.jsonc", import.meta.url), "utf8"),
): Record<string, string> {
  const parsed = ts.parseConfigFileTextToJson("wrangler.web.jsonc", webWorkerConfig);
  if (parsed.error) throw new Error("wrangler.web.jsonc is not valid JSONC.");
  return (parsed.config as { env?: { production?: { vars?: Record<string, string> } } })
    .env?.production?.vars ?? {};
}

/**
 * Environment `pnpm run dev` adds to `next dev`, on top of the API Worker
 * fixture's own variables.
 *
 * `PUBLIC_APP_ORIGIN` must equal the fixture's `publicOrigin`: the
 * authentication client refuses to start without it, and Better Auth accepts
 * only that origin. Nothing else from production applies to a local server.
 */
export function devAppEnvironment(webWorkerConfig?: string): Record<string, string> {
  const production = productionWebWorkerVariables(webWorkerConfig);
  const environment: Record<string, string> = { PUBLIC_APP_ORIGIN: CANONICAL_APP_ORIGIN };
  for (const name of PRODUCTION_ANALYTICS_VARIABLES) {
    const value = production[name];
    if (value === undefined) throw new Error(`wrangler.web.jsonc no longer gives the production web Worker ${name}.`);
    environment[name] = value;
  }
  return environment;
}
