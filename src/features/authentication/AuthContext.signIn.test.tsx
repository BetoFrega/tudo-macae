// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { SignInProbe } from "./AuthContextProbes";
import { ReportedSessionFailure, SessionSynchronizationFailure } from "./readBrowserSession";

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

describe("AuthProvider", () => {
  test("picks up the roles minted by a fresh sign-in", async () => {
    loginWithPasswordRequest.mockImplementation(async input =>
      input.email === "a@example.com" && input.password === "x"
        ? { success: true }
        : { success: false, error: "Credenciais inválidas." });
    readBrowserSession.mockResolvedValue(null);
    readBrowserSessionAfterMutation.mockResolvedValueOnce({
      uid: "u1",
      email: "a@example.com",
      isAdmin: false,
      isEditor: true,
    });

    render(<AuthProvider><SignInProbe /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("resultado:sucesso")).toBeInTheDocument();
    expect(screen.getByText("quem:u1/a@example.com")).toBeInTheDocument();
    expect(screen.getByText("editor:true")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });

  test("registers through the selected action", async () => {
    loginWithPasswordRequest.mockResolvedValue({ success: false, error: "Action errada." });
    register.mockResolvedValue({ success: true });
    readBrowserSession.mockResolvedValue(null);
    readBrowserSessionAfterMutation.mockResolvedValueOnce({
      uid: "u2",
      email: "a@example.com",
      isAdmin: false,
      isEditor: false,
    });

    render(<AuthProvider><SignInProbe action="register" /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText("resultado:sucesso")).toBeInTheDocument();
    expect(screen.getByText("quem:u2/a@example.com")).toBeInTheDocument();
  });

  test("returns the login action's refusal", async () => {
    loginWithPasswordRequest.mockResolvedValue({ success: false, error: "Credenciais inválidas." });

    render(<AuthProvider><SignInProbe /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("resultado:Credenciais inválidas."))
      .toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("reports when a successful login has no valid synchronized session", async () => {
    loginWithPasswordRequest.mockResolvedValue({ success: true });
    readBrowserSession.mockResolvedValue(null);
    readBrowserSessionAfterMutation.mockResolvedValueOnce(null);

    render(<AuthProvider><SignInProbe /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("resultado:Erro ao obter dados do usuário."))
      .toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("reports an unexpected POST session-sync failure without exposing its message", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    loginWithPasswordRequest.mockResolvedValue({ success: true });
    readBrowserSessionAfterMutation.mockRejectedValueOnce(new Error("private session transport detail"));

    render(<AuthProvider><SignInProbe /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("resultado:Não foi possível confirmar a sessão. Atualize a página e tente novamente."))
      .toBeInTheDocument();
    expect(log).toHaveBeenCalledTimes(1);
    const failure = JSON.parse(log.mock.calls[0][0]);
    expect(failure).toMatchObject({
      event: "authentication.session.refresh_failed",
      service: "browser",
      outcome: "failed",
      failureCategory: "unknown",
      trigger: "login_confirmation",
      operationId: expect.stringMatching(/^[a-f0-9-]{36}$/u),
      route: "/api/autenticacao/sessao",
    });
    expect(capture).toHaveBeenCalledExactlyOnceWith("session_synchronization_failed", failure);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private session transport detail");
    log.mockRestore();
  });

  test("reports the category and HTTP status of a failed confirmation after registration", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    register.mockResolvedValue({ success: true });
    readBrowserSessionAfterMutation.mockRejectedValueOnce(new SessionSynchronizationFailure("http_status", 502));

    render(<AuthProvider><SignInProbe action="register" /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText("resultado:Não foi possível confirmar a sessão. Atualize a página e tente novamente."))
      .toBeInTheDocument();
    const failure = JSON.parse(log.mock.calls[0][0]);
    expect(failure).toMatchObject({ failureCategory: "http_status", httpStatus: 502, trigger: "registration_confirmation" });
    expect(capture).toHaveBeenCalledExactlyOnceWith("session_synchronization_failed", failure);
    log.mockRestore();
  });

  test("does not report a POST session-sync failure already reported by the route", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    loginWithPasswordRequest.mockResolvedValue({ success: true });
    readBrowserSessionAfterMutation.mockRejectedValueOnce(new ReportedSessionFailure("Session synchronization failed"));

    render(<AuthProvider><SignInProbe /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("resultado:Não foi possível confirmar a sessão. Atualize a página e tente novamente."))
      .toBeInTheDocument();
    expect(log).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("refuses an unsupported authentication method", async () => {
    render(<AuthProvider><SignInProbe method={"unsupported" as never} /></AuthProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("resultado:Método de autenticação não suportado."))
      .toBeInTheDocument();
  });
});

test("finishes an earlier refresh before minting new login cookies", async () => {
  let finish!: (value: null) => void;
  readBrowserSession.mockReturnValueOnce(new Promise((resolve) => {
    finish = resolve;
  }));
  loginWithPasswordRequest.mockResolvedValue({ success: true });
  readBrowserSessionAfterMutation.mockResolvedValue({ uid: "new-user", email: "a@example.com", isAdmin: false, isEditor: true });
  render(<AuthProvider><SignInProbe /></AuthProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
  expect(loginWithPasswordRequest).not.toHaveBeenCalled();
  await act(async () => {
    finish(null);
  });
  await screen.findByText("resultado:sucesso");
  expect(screen.getByText("quem:new-user/a@example.com")).toBeInTheDocument();
  expect(screen.getByText("editor:true")).toBeInTheDocument();
});
