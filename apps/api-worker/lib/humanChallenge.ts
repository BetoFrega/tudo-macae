export const humanChallengeHeader = "x-turnstile-token";

const maximumTokenLength = 2048;

// Each widget embed sends its own action; a token minted for login cannot open sign-up.
const challengedActions = new Map([
  ["/sign-up/email", "signup"],
  ["/sign-in/email", "login"],
  ["/request-password-reset", "password-reset"],
]);

export type HumanChallengeEnv = Env & { TURNSTILE_SECRET?: string };

/** Why verification itself could not decide; a bot's token never produces one. */
export type HumanChallengeUnavailable = "configuration" | "network" | "timeout" | "http_status" | "invalid_response";

export class HumanChallengeVerificationUnavailable extends Error {
  constructor(readonly category: HumanChallengeUnavailable, readonly status?: number) {
    super("Human challenge verification unavailable");
  }
}

export type HumanChallengeVerdict = { success: boolean; action?: string; hostname?: string };
/** Judges a token with the provider; throws HumanChallengeVerificationUnavailable when it cannot. */
export type HumanChallengeVerifier = (secret: string, token: string) => Promise<HumanChallengeVerdict>;

function presentedToken(headers: Headers) {
  const token = headers.get(humanChallengeHeader);
  return token && token.length <= maximumTokenLength ? token : undefined;
}

/**
 * Admits a challenged authentication path only with a Turnstile token whose action and
 * hostname match. TURNSTILE_ENFORCEMENT=off is the emergency switch; any other value,
 * including absence, enforces, and a missing secret or verifier, or a verifier that
 * cannot decide, refuses. Refusals that block every person, not just bots, go to
 * reportUnavailable. A token solved for another action or host (e.g. localhost, also a
 * widget domain) is an ordinary refusal.
 */
export async function admitsHumanChallenge(
  path: string,
  headers: Headers,
  env: Pick<HumanChallengeEnv, "TURNSTILE_ENFORCEMENT" | "TURNSTILE_SECRET" | "PUBLIC_APP_ORIGIN">,
  verify: HumanChallengeVerifier | undefined,
  reportUnavailable: (category: HumanChallengeUnavailable, status?: number) => void,
) {
  const expectedAction = challengedActions.get(path);
  if (expectedAction === undefined || env.TURNSTILE_ENFORCEMENT === "off") return true;
  const token = presentedToken(headers);
  if (!token) return false;
  try {
    if (!env.TURNSTILE_SECRET || !verify) throw new HumanChallengeVerificationUnavailable("configuration");
    const result = await verify(env.TURNSTILE_SECRET, token);
    return result.success
      && result.action === expectedAction
      && result.hostname === new URL(env.PUBLIC_APP_ORIGIN).hostname;
  }
  catch (error) {
    if (error instanceof HumanChallengeVerificationUnavailable) reportUnavailable(error.category, error.status);
    return false;
  }
}
