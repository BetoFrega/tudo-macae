import { authenticationNetworkHeaders, isHumanChallengeRefusal, withHumanChallenge } from "./clientNetwork";
import { configuredAuthenticationClient } from "@tudomacae/authentication-client/server";
import { installWorkerSession } from "./authority";
import { createAccountAccess, type AccountAccessDependencies } from "@tudomacae/authentication/account-access";
import { requestEmailVerification } from "./verification";

import { authenticationRetryAfter } from "./rateLimit";
import { authenticationRetryMessage } from "@tudomacae/authentication/password-login";

type SignUp = AccountAccessDependencies["signUp"];

async function signUpWithWorker({ challengeToken, ...credentials }: Parameters<SignUp>[0]): ReturnType<SignUp> {
  const client = configuredAuthenticationClient();
  const response = await client.request("/api/auth/sign-up/email", {
    body: credentials,
    headers: withHumanChallenge(await authenticationNetworkHeaders(), challengeToken),
  });
  const retryAfter = authenticationRetryAfter(response);
  if (retryAfter !== null) return { status: "refused", retryAfter };
  if (await isHumanChallengeRefusal(response)) return { status: "refused", reason: "HUMAN_CHALLENGE_FAILED" };
  const credential = client.sessionCredential(response);
  const data = await response.json();
  if (response.ok && credential)
    return {
      status: "created",
      sessionCredential: credential,
      verificationCredential: "",
      verification: data.verification,
    };
  return {
    status: "refused",
    reason:
      data?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
        ? "EMAIL_EXISTS"
        : undefined,
  };
}

export const accountAccess = createAccountAccess({
  signUp: signUpWithWorker,
  issueSession: installWorkerSession,
  sendVerification: () => requestEmailVerification(),
  async requestPasswordReset(email, challengeToken) {
    const response = await configuredAuthenticationClient().request("/api/auth/request-password-reset", {
      body: { email },
      headers: withHumanChallenge(await authenticationNetworkHeaders(), challengeToken),
    });
    const retryAfter = authenticationRetryAfter(response);
    if (retryAfter !== null) return { retryAfter };
    return (await isHumanChallengeRefusal(response)) ? "challenged" : response.ok;
  },
  async resetPassword(oobCode, newPassword) {
    const response = await configuredAuthenticationClient().request(
      "/api/auth/reset-password",
      { body: { token: oobCode, newPassword }, headers: await authenticationNetworkHeaders() },
    );
    const retryAfter = authenticationRetryAfter(response);
    if (retryAfter !== null)
      return { success: false, error: authenticationRetryMessage(retryAfter), retryAfter };
    const data: { email?: string; code?: string; error?: { message: string } }
      = await response.json();
    return response.ok
      ? { success: true, email: data.email }
      : { success: false, error: data.code === "INVALID_TOKEN" ? "INVALID_OOB_CODE" : data.error?.message };
  },
});
