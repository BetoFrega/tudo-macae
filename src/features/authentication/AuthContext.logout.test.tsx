// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { EmailVerificationAction } from "@tudomacae/authentication/ui";
import { AuthProvider } from "./AuthContext";
import { renderProvider } from "./AuthContextProbes";

const { applyEmailVerification, readBrowserSession, readBrowserSessionAfterMutation, loginWithPasswordRequest, register, clearSessionCookie, capture, identify, refresh } = vi.hoisted(() => ({
  applyEmailVerification: vi.fn(async () => ({ status: "confirmed", email: "ana@example.com" })),
  identify: vi.fn(),
  refresh: vi.fn(),
  capture: vi.fn(),
  readBrowserSession: vi.fn(),
  readBrowserSessionAfterMutation: vi.fn(),
  loginWithPasswordRequest: vi.fn(),
  register: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: {
  identify, capture, reset: vi.fn(),
  get_property: vi.fn(), getSessionProperty: vi.fn(),
} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), redirect: vi.fn() }));
vi.mock("./readBrowserSession", async importOriginal => ({
  ...await importOriginal<typeof import("./readBrowserSession")>(),
  readBrowserSession,
  readBrowserSessionAfterMutation,
}));
vi.mock("./passwordLoginRequest", () => ({ loginWithPasswordRequest }));
vi.mock("./actions/emailVerification", () => ({ applyEmailVerification }));
vi.mock("./actions/register", () => ({ register }));
vi.mock("./actions/clearSessionCookie", () => ({ clearSessionCookie }));

beforeEach(() => {
  vi.unstubAllEnvs();
  readBrowserSession.mockReset();
  readBrowserSessionAfterMutation.mockReset();
  loginWithPasswordRequest.mockReset();
  register.mockReset();
  refresh.mockReset();
  vi.clearAllMocks();
  clearSessionCookie.mockResolvedValue({ success: true });
  readBrowserSessionAfterMutation.mockResolvedValue(null);
  readBrowserSession.mockResolvedValue(null);
});

test("finishes an earlier refresh before clearing logout cookies", async () => {
  const oldUser = { uid: "u1", email: "a@example.com", isAdmin: true, isEditor: true };
  readBrowserSession.mockResolvedValue(oldUser);
  renderProvider();
  await screen.findByText("quem:u1/a@example.com");
  let finish!: (value: typeof oldUser) => void;
  readBrowserSession.mockReturnValueOnce(new Promise((resolve) => {
    finish = resolve;
  }));
  fireEvent.focus(window);
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  expect(clearSessionCookie).not.toHaveBeenCalled();
  await act(async () => {
    finish(oldUser);
  });
  expect(await screen.findByText("quem:ninguém")).toBeInTheDocument();
  expect(screen.getByText("admin:false editor:false")).toBeInTheDocument();
});

test.each(["refused", "unavailable"])("preserves confirmed identity and offers retry when logout is %s", async (failure) => {
  const currentUser = { uid: "u1", email: "a@example.com", isAdmin: true, isEditor: true };
  readBrowserSession.mockResolvedValue(currentUser);
  if (failure === "refused") clearSessionCookie.mockResolvedValueOnce({ success: false });
  else clearSessionCookie.mockRejectedValueOnce(new Error("private transport details"));
  renderProvider();
  await screen.findByText("quem:u1/a@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível sair. Tente novamente.");
  expect(screen.getByText("quem:u1/a@example.com")).toBeInTheDocument();
  expect(screen.getByText("admin:true editor:true")).toBeInTheDocument();
  expect(capture).not.toHaveBeenCalledWith("user_logged_out");
  fireEvent.focus(window);
  await waitFor(() => expect(readBrowserSession).toHaveBeenCalledTimes(2));
  expect(screen.getByText("quem:u1/a@example.com")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  expect(await screen.findByText("quem:ninguém")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(capture).toHaveBeenCalledWith("user_logged_out");
});

test.each(["background", "fresh"])("correlates a confirmation timeout with its pending %s session read without credentials", async (phase) => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_RELEASE", "release-under-test");
  readBrowserSession.mockReturnValue(new Promise(() => {}));
  if (phase === "fresh") readBrowserSession.mockResolvedValueOnce(null);
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    render(
      <AuthProvider>
        <EmailVerificationAction code="private-one-use-code" continuation={{ href: "/minha-conta/verificar-email?ad=ad-1", label: "Voltar ao anúncio" }} confirmationMessage="Seu anúncio continua como você deixou." />
      </AuthProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
    expect(capture).toHaveBeenCalledOnce();
    const operationId = capture.mock.calls[0][1].operationId;
    expect(operationId).toEqual(expect.any(String));
    expect(readBrowserSession).toHaveBeenCalledTimes(phase === "fresh" ? 2 : 1);
    expect(operationId).toBe(readBrowserSession.mock.lastCall?.[0]);
    const expiry = {
      event: "authentication.session.confirmation_wait_expired",
      service: "browser",
      environment: "test",
      release: "release-under-test",
      outcome: "fallback",
      operationId,
      route: "/minha-conta/acao",
    };
    expect(capture).toHaveBeenCalledExactlyOnceWith("session_confirmation_wait_expired", expiry);
    expect(warnings).toHaveBeenCalledExactlyOnceWith(JSON.stringify(expiry));
  }
  finally {
    warnings.mockRestore();
    vi.useRealTimers();
  }
});
