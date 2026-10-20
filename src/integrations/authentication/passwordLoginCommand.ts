import { authenticationNetworkHeaders, isHumanChallengeRefusal, withHumanChallenge } from "./clientNetwork";
import { configuredAuthenticationClient } from "@tudomacae/authentication-client/server";
import { installWorkerSession } from "./authority";
import { createPasswordLogin } from "@tudomacae/authentication/password-login";

import { authenticationRetryAfter } from "./rateLimit";

type Credentials = { email: string; password: string; challengeToken?: string | undefined };

async function authenticateWithWorker({ email, password, challengeToken }: Credentials) {
  const client = configuredAuthenticationClient();
  const response = await client.request("/api/auth/sign-in/email", {
    body: { email, password },
    headers: withHumanChallenge(await authenticationNetworkHeaders(), challengeToken),
  });
  const retryAfter = authenticationRetryAfter(response);
  if (retryAfter !== null) return { status: "limited", retryAfter } as const;
  if (await isHumanChallengeRefusal(response)) return { status: "challenged" } as const;
  const credential = client.sessionCredential(response);
  return response.ok && credential
    ? { status: "authenticated", sessionCredential: credential } as const
    : { status: "refused" } as const;
}

const passwordLogin = createPasswordLogin({
  authenticate: authenticateWithWorker,
  createSession: installWorkerSession,
});

export function loginPassword(input: unknown) {
  return passwordLogin.login(input);
}
