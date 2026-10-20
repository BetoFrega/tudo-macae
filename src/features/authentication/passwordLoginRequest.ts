import posthog from "posthog-js";

type LoginFailureCategory = "transport" | "response_decode" | "invalid_response";
type LoginResult = { success: true } | { success: false; error: string };

const LOGIN_FAILURE = "Não foi possível entrar. Tente novamente.";

/** Returns undefined when the body does not match the login contract. */
function decodeLoginResult(value: unknown): LoginResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  if (body.success === true) return typeof body.uid === "string" ? { success: true } : undefined;
  if (body.success === false && typeof body.error === "string") return { success: false, error: body.error };
  return undefined;
}

export async function loginWithPasswordRequest(input: { email: string; password: string; challengeToken?: string }): Promise<LoginResult> {
  const operationId = crypto.randomUUID();
  let failureCategory: LoginFailureCategory = "transport";
  let serverReportedFailure = false;
  try {
    const response = await fetch("/api/autenticacao/entrar", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-auth-operation-id": operationId,
      },
      body: JSON.stringify(input),
    });
    serverReportedFailure = response.status === 503 && response.headers.get("x-auth-error-reported") === "1";
    failureCategory = "response_decode";
    const value: unknown = await response.json();
    failureCategory = "invalid_response";
    const result = decodeLoginResult(value);
    if (result) return result;
  }
  catch { /* Reported below with the stage that failed. */ }
  if (!serverReportedFailure) reportLoginFailure(failureCategory, operationId);
  return { success: false, error: LOGIN_FAILURE };
}

function reportLoginFailure(
  failureCategory: LoginFailureCategory,
  operationId: string,
) {
  const failure = {
    event: "authentication.login.request_failed",
    service: "browser",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
    outcome: "failed",
    failureCategory,
    operationId,
    route: "/api/autenticacao/entrar",
  };
  console.warn(JSON.stringify(failure));
  posthog.capture("authentication_login_request_failed", failure);
}
