"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  AuthProvider as SharedAuthProvider,
  AuthenticationUIProvider,
  type AuthenticationIntegration,
  type HumanChallengeProps,
  type SessionSynchronizationTrigger,
} from "@tudomacae/authentication/ui";
import { isTestEnv } from "@/lib/appEnv";
import { clearSessionCookie } from "./actions/clearSessionCookie";
import { register } from "./actions/register";
import { requestPasswordResetEmail } from "./actions/requestPasswordResetEmail";
import { resetPassword } from "./actions/resetPassword";
import { applyEmailVerification } from "./actions/emailVerification";
import { loginWithPasswordRequest } from "./passwordLoginRequest";
import { TurnstileChallenge } from "./components/TurnstileChallenge";
import {
  readBrowserSession,
  readBrowserSessionAfterMutation,
  ReportedSessionFailure,
  SessionSynchronizationFailure,
} from "./readBrowserSession";

export { AuthContext, useAuth } from "@tudomacae/authentication/ui";
export type { AuthContextType } from "@tudomacae/authentication/ui";

function reportSessionFailure(error: unknown, operationId: string, trigger: SessionSynchronizationTrigger) {
  if (error instanceof ReportedSessionFailure) return;
  const failure = {
    event: "authentication.session.refresh_failed",
    service: "browser",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
    outcome: "failed",
    failureCategory: error instanceof SessionSynchronizationFailure ? error.category : "unknown",
    ...(error instanceof SessionSynchronizationFailure && error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
    trigger,
    operationId,
    route: "/api/autenticacao/sessao",
  };
  console.warn(JSON.stringify(failure));
  posthog.capture("session_synchronization_failed", failure);
}
function reportSessionWaitExpired(operationId: string) {
  const expiry = {
    event: "authentication.session.confirmation_wait_expired",
    service: "browser",
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE ?? "unknown",
    outcome: "fallback",
    operationId,
    route: "/minha-conta/acao",
  };
  console.warn(JSON.stringify(expiry));
  posthog.capture("session_confirmation_wait_expired", expiry);
}
// Without a site key (local and test builds) forms send no token; the Worker decides enforcement.
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
function renderHumanChallenge(props: HumanChallengeProps) {
  return turnstileSiteKey ? <TurnstileChallenge siteKey={turnstileSiteKey} {...props} /> : null;
}

function installTestLogin(
  login: (email: string, password: string) => Promise<void>,
) {
  window.login = login;
  return () => {
    delete window.login;
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { refresh } = useRouter();
  const integration = useMemo<AuthenticationIntegration>(
    () => ({
      readSession: readBrowserSession,
      readSessionAfterMutation: readBrowserSessionAfterMutation,
      login: loginWithPasswordRequest,
      register,
      logout: async () => {
        const result = await clearSessionCookie();
        if (!result.success) throw new Error("Session revocation refused");
      },
      requestPasswordResetEmail,
      resetPassword,
      applyEmailVerification,
      describeLogin(mode, purpose) {
        if (mode === "forgot-password")
          return "Digite seu email para receber um link de recuperação.";
        if (mode === "login")
          return "Atualizamos o acesso. Se sua conta já existia, use Esqueci minha senha para definir uma nova senha pelo e-mail cadastrado.";
        if (purpose === "create-business")
          return mode === "register"
            ? "Crie uma conta para cadastrar seu negócio."
            : "Entre para cadastrar seu negócio.";
        return mode === "register"
          ? "Crie uma conta para começar a publicar anúncios."
          : "Você precisa estar logado para publicar um anúncio.";
      },
      navigation: {
        refresh,
        redirect,
        authenticatedDestination: "/minha-conta/anuncios",
      },
      Link,
      telemetry: {
        hasIdentifiedUser: () => posthog.get_property("$user_state") === "identified"
          || posthog.getSessionProperty("$user_state") === "identified",
        identify: (uid, properties) => posthog.identify(uid, properties),
        capture: (event, ...properties) => posthog.capture(event, ...properties),
        reset: () => posthog.reset(),
      },
      reportSessionFailure,
      reportSessionWaitExpired,
      ...(turnstileSiteKey ? { renderHumanChallenge } : {}),
      ...(isTestEnv() ? { installTestLogin } : {}),
    }),
    [refresh],
  );
  return (
    <AuthenticationUIProvider integration={integration}>
      <SharedAuthProvider>{children}</SharedAuthProvider>
    </AuthenticationUIProvider>
  );
}
