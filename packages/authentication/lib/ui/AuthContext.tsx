"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { LoginModalProvider } from "./LoginModalContext";
import { useAuthenticationIntegration, type AuthenticationIntegration, type AuthenticationResult } from "./integration";
import type { SessionUser, UserRoles } from "../../session";

import { AuthContext, type AuthContextType } from "./authState";
export { AuthContext, useAuth } from "./authState";
export type { AuthContextType } from "./authState";

const NO_ROLES: UserRoles = { isAdmin: false, isEditor: false };

const rolesOf = (currentUser: {
  isAdmin?: boolean;
  isEditor?: boolean;
}): UserRoles => ({
  isAdmin: !!currentUser.isAdmin,
  isEditor: !!currentUser.isEditor,
});

// The uid is the only person property: email and roles stay out of PostHog.
function identifyUser(currentUser: SessionUser, posthog: AuthenticationIntegration["telemetry"]) {
  posthog.identify(currentUser.uid, {});
}

function authUserOf(currentUser: SessionUser): NonNullable<AuthContextType["user"]> {
  return { uid: currentUser.uid, email: currentUser.email || null, emailVerified: currentUser.emailVerified };
}

function hasIdentityChanged(identifiedUserId: string | null, currentUser: SessionUser | null, posthog: AuthenticationIntegration["telemetry"]) {
  return identifiedUserId !== (currentUser?.uid ?? null)
    || (!currentUser && posthog.hasIdentifiedUser());
}

function syncTelemetryIdentity(currentUser: SessionUser | null, posthog: AuthenticationIntegration["telemetry"]) {
  if (currentUser) identifyUser(currentUser, posthog);
  else posthog.reset();
}

function verificationErrorOf(result: AuthenticationResult) {
  return "verificationError" in result ? String(result.verificationError ?? "") : "";
}

function confirmationTrigger(action: "login" | "register") {
  return action === "register" ? "registration_confirmation" as const : "login_confirmation" as const;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const integration = useAuthenticationIntegration();
  const { navigation: router, telemetry: posthog, logout: clearSessionCookie, register,
    readSession: readBrowserSession, readSessionAfterMutation: readBrowserSessionAfterMutation,
    login: loginWithPasswordRequest, reportSessionFailure } = integration;
  const [user, setUser] = useState<AuthContextType["user"] | null>(null);
  // Both roles travel as one value. They are written in three places — mount,
  // login, logout — and a second `useState` would be a fourth place to forget.
  const [verificationError, setVerificationError] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const [roles, setRoles] = useState<UserRoles>(NO_ROLES);
  const identifiedUserId = useRef<string | null>(null);
  const synchronizedOnce = useRef(false);
  const [isPending, startTransition] = useTransition();
  // Keep cookie-changing actions behind earlier reads: an invalid GET response
  // must finish clearing old cookies before login mints a new session.
  const sessionQueue = useRef<Promise<void>>(Promise.resolve());
  const runSessionOperation = useCallback(<T,>(operation: () => Promise<T>) => {
    const result = sessionQueue.current.then(operation);
    sessionQueue.current = result.then(() => {}, () => {});
    return result;
  }, []);
  const refreshInFlight = useRef<Promise<SessionUser | null> | null>(null);
  const refreshOperationId = useRef<string | undefined>(undefined);
  const getSessionRefreshOperationId = useCallback(() => refreshOperationId.current, []);

  const refreshSession = useCallback((trigger: "background_refresh" | "explicit_refresh") => {
    // Mount, focus and visibility may fire together; one pending request
    // owns their shared result until it settles.
    if (refreshInFlight.current) return refreshInFlight.current;

    const operationId = crypto.randomUUID();
    refreshOperationId.current = operationId;
    const synchronization = runSessionOperation(async () => {
      try {
        const currentUser = await readBrowserSession(operationId);
        setUser(currentUser ? authUserOf(currentUser) : null);
        setRoles(currentUser ? rolesOf(currentUser) : NO_ROLES);
        const identityChanged = hasIdentityChanged(identifiedUserId.current, currentUser, posthog);
        if (identityChanged) syncTelemetryIdentity(currentUser, posthog);
        identifiedUserId.current = currentUser?.uid ?? null;
        // The server rendered this document with the same session cookie, so the
        // first signed-in read has nothing new to render. Refreshing here remounts
        // client state under vinext and loops on forbidden/unauthorized pages.
        const firstSignedInRead = !synchronizedOnce.current && currentUser !== null;
        synchronizedOnce.current = true;
        if (identityChanged && !firstSignedInRead) startTransition(() => router.refresh());
        return currentUser;
      }
      catch (error) {
        reportSessionFailure(error, operationId, trigger);
        throw error;
      }
      finally {
        refreshInFlight.current = null;
        refreshOperationId.current = undefined;
      }
    });
    refreshInFlight.current = synchronization;
    return synchronization;
  }, [runSessionOperation, readBrowserSession, posthog, reportSessionFailure, router]);
  const refreshSessionFresh = useCallback(async () => {
    // Explicit callers may have changed email or verification while an older
    // background read was pending. Only a subsequent read can confirm that state.
    const pending = refreshInFlight.current;
    if (pending) await pending.catch(() => {});
    return refreshSession("explicit_refresh");
  }, [refreshSession]);
  useEffect(() => {
    const refresh = () => {
      startTransition(async () => {
        try {
          await refreshSession("background_refresh");
        }
        catch {
          // Background failures preserve the last confirmed identity. Explicit
          // callers still receive refreshSession's rejection and can show recovery.
        }
      });
    };
    refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshSession]);

  const logout = async () => runSessionOperation(async () => {
    setLogoutError("");
    try {
      await clearSessionCookie();
      posthog.capture("user_logged_out");
      posthog.reset();
      identifiedUserId.current = null;
      startTransition(() => {
        setUser(null);
        setVerificationError("");
        setRoles(NO_ROLES);
        router.refresh();
      });
    }
    catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
    }
  });

  const loginClient: AuthContextType["login"] = async (input: {
    method: "email-password";
    action: "login" | "register";
    data: {
      email: string;
      password: string;
      challengeToken?: string | undefined;
    };
  }) => runSessionOperation(async () => {
    if (input.method === "email-password") {
      const { email, password, challengeToken } = input.data;
      const credentials = { email, password, ...(challengeToken === undefined ? {} : { challengeToken }) };
      const result = input.action === "register"
        ? await register(credentials)
        : await loginWithPasswordRequest(credentials);
      if (result.success) {
        setVerificationError(verificationErrorOf(result));
        let currentUser: SessionUser | null;
        const operationId = crypto.randomUUID();
        try {
          currentUser = await readBrowserSessionAfterMutation(operationId);
        }
        catch (error) {
          reportSessionFailure(error, operationId, confirmationTrigger(input.action));
          return { success: false, error: "Não foi possível confirmar a sessão. Atualize a página e tente novamente." };
        }
        if (currentUser) {
          identifyUser(currentUser, posthog);
          identifiedUserId.current = currentUser.uid;
          posthog.capture("user_authenticated", {
            authentication_action: input.action,
          });
          setUser(authUserOf(currentUser));
          setRoles(rolesOf(currentUser));
          startTransition(() => router.refresh());
          return { success: true };
        }
        return { success: false, error: "Erro ao obter dados do usuário." };
      }
      return { success: false, ...(result.error === undefined ? {} : { error: result.error }) };
    }
    else {
      return { success: false, error: "Método de autenticação não suportado." };
    }
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: roles.isAdmin,
        isEditor: roles.isEditor,
        loading: isPending,
        logout,
        logoutError,
        refreshSession: refreshSessionFresh,
        getSessionRefreshOperationId,
        verificationError,
        clearVerificationError: () => setVerificationError(""),
        login: loginClient,
      }}
    >
      <LoginModalProvider>{children}</LoginModalProvider>
    </AuthContext.Provider>
  );
}
