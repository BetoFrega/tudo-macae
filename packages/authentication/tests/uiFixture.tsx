import { vi } from "vitest";
import { AuthenticationUIProvider, type AuthenticationIntegration } from "../ui";
import type { ReactNode } from "react";

export function integrationFixture(overrides: Partial<AuthenticationIntegration> = {}): AuthenticationIntegration {
  return {
    readSession: vi.fn(async () => null),
    readSessionAfterMutation: vi.fn(async () => null),
    login: vi.fn(async () => ({ success: true })),
    register: vi.fn(async () => ({ success: true })),
    logout: vi.fn(async () => {}),
    requestPasswordResetEmail: vi.fn(async () => ({ success: true })),
    resetPassword: vi.fn(async () => ({ success: true })),
    describeLogin: () => "Entre na sua conta.",
    applyEmailVerification: vi.fn(async () => ({ status: "confirmed" as const, email: "ana@example.com" })),
    navigation: { authenticatedDestination: "/account", refresh: vi.fn(), redirect: () => { throw new Error("Redirect"); } },
    Link: props => <a {...props} />,
    telemetry: { hasIdentifiedUser: vi.fn(() => false), identify: vi.fn(), capture: vi.fn(), reset: vi.fn() },
    reportSessionFailure: vi.fn(),
    reportSessionWaitExpired: vi.fn(),
    ...overrides,
  };
}
export function UI({ children, integration }: { children: ReactNode; integration: AuthenticationIntegration }) {
  return <AuthenticationUIProvider integration={integration}>{children}</AuthenticationUIProvider>;
}
