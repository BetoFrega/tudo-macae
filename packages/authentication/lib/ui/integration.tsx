"use client";

import { createContext, useContext, type ComponentType, type ReactNode, type Ref } from "react";
import type { SessionUser } from "../../session";

export type EmailVerificationValue = {
  uid: string;
  email: string;
  emailVerified: boolean;
  nextSendAt: number;
  destination: string;
  error?: string;
  pendingEmail?: string;
} | null;
export type SessionSynchronizationTrigger = "background_refresh" | "explicit_refresh" | "login_confirmation" | "registration_confirmation";
export type HumanChallengeAction = "signup" | "login" | "password-reset";
export type HumanChallengeProps = {
  action: HumanChallengeAction;
  onToken(token: string | null): void;
  onUnavailable(): void;
};
export type AuthenticationResult = { success: boolean; error?: string; verificationError?: string };
export interface AuthenticationIntegration {
  readSession(operationId: string): Promise<SessionUser | null>;
  readSessionAfterMutation(operationId: string): Promise<SessionUser | null>;
  login(input: { email: string; password: string; challengeToken?: string }): Promise<AuthenticationResult>;
  register(input: { email: string; password: string; challengeToken?: string }): Promise<AuthenticationResult>;
  logout(): Promise<void>;
  requestPasswordResetEmail(input: { email: string; challengeToken?: string }): Promise<{ success: boolean; error?: string }>;
  resetPassword(code: string, password: string): Promise<{ success: boolean; error?: string | undefined; email?: string | undefined; retryAfter?: number }>;
  describeLogin(mode: "login" | "register" | "forgot-password", purpose?: string): string;
  applyEmailVerification(code: string): Promise<{ status: "confirmed"; email: string } | { status: "error"; error: string }>;
  navigation: { refresh(): void; redirect(path: string): never; authenticatedDestination: string };
  Link: ComponentType<{ href: string; children?: ReactNode; className?: string; ref?: Ref<HTMLAnchorElement> }>;
  telemetry: {
    hasIdentifiedUser(): boolean;
    identify(uid: string, properties: Record<string, unknown>): void;
    capture(event: string, properties?: Record<string, unknown>): void;
    reset(): void;
  };
  reportSessionFailure(error: unknown, operationId: string, trigger: SessionSynchronizationTrigger): void;
  reportSessionWaitExpired(operationId: string): void;
  renderHumanChallenge?: (props: HumanChallengeProps) => ReactNode;
  installTestLogin?: (login: (email: string, password: string) => Promise<void>) => () => void;
}
const IntegrationContext = createContext<AuthenticationIntegration | null>(null);
export function AuthenticationUIProvider({ integration, children }: { integration: AuthenticationIntegration; children: ReactNode }) {
  return <IntegrationContext.Provider value={integration}>{children}</IntegrationContext.Provider>;
}
export function useAuthenticationIntegration() {
  const value = useContext(IntegrationContext);
  if (!value) throw new Error("AuthenticationUIProvider is required");
  return value;
}
// Forms also render outside the provider (standalone pages, tests); they then send no token.
export function useHumanChallengeRenderer() {
  return useContext(IntegrationContext)?.renderHumanChallenge;
}
