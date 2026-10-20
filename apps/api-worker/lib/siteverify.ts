import z from "zod";
import { HumanChallengeVerificationUnavailable, type HumanChallengeVerifier } from "./humanChallenge";

const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifyResult = z.object({
  "success": z.boolean(),
  "error-codes": z.array(z.string()).default([]),
  "action": z.string().optional(),
  "hostname": z.string().optional(),
});
// Siteverify answers these with success=false although the token was never judged.
const secretErrors = new Set(["missing-input-secret", "invalid-input-secret"]);
// A malformed request or a Cloudflare fault refuses every visitor, not just bots.
const siteverifyFaults = new Set(["bad-request", "internal-error"]);

// Below the five-second Next client deadline, so the Worker answers and classifies first.
const siteverifyTimeoutMs = 3000;

/**
 * Turnstile siteverify over `send`. remoteip is omitted: production does not forward the
 * visitor address yet, and the proxy address would mislead siteverify.
 */
export function createSiteverify(send: typeof fetch): HumanChallengeVerifier {
  return async (secret, token) => {
    const response = await send(siteverifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(siteverifyTimeoutMs),
      body: new URLSearchParams({ secret, response: token }),
    }).catch((error: unknown) => {
      throw new HumanChallengeVerificationUnavailable(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
    });
    if (!response.ok) throw new HumanChallengeVerificationUnavailable("http_status", response.status);
    const result = siteverifyResult.safeParse(await response.json().catch(() => undefined));
    if (!result.success) throw new HumanChallengeVerificationUnavailable("invalid_response");
    const codes = result.data["error-codes"];
    if (codes.some(code => secretErrors.has(code))) throw new HumanChallengeVerificationUnavailable("configuration");
    if (codes.some(code => siteverifyFaults.has(code))) throw new HumanChallengeVerificationUnavailable("invalid_response");
    return result.data;
  };
}
