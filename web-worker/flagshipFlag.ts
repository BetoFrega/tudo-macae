import { env } from "cloudflare:workers";
import { evaluateFlagshipFlag, type FlagshipBinding } from "./flagshipEvaluation";

// Replaces `@/integrations/release-control/flagshipFlag` in the Worker build;
// `wrangler.web.jsonc` binds `FLAGS` to the Flagship app.
export function readFlagshipFlag(flagKey: string): Promise<boolean> {
  return evaluateFlagshipFlag(env.FLAGS as FlagshipBinding | undefined, flagKey);
}
