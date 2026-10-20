// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthContext, ForgotPasswordForm, LoginForm, RegisterForm, type HumanChallengeProps } from "../ui";
import { integrationFixture, UI } from "./uiFixture";

const login = vi.fn();
let mounts = 0;

// Stands in for Turnstile: each mount issues a distinct single-use token after a click.
function FakeChallenge({ action, onToken, onUnavailable }: HumanChallengeProps) {
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <>
      <button type="button" onClick={() => onToken(`${action}-token-${mounts}`)}>Verificar</button>
      <button type="button" onClick={onUnavailable}>Falhar</button>
      <button type="button" onClick={() => onToken(null)}>Expirar</button>
    </>
  );
}

function renderWithChallenge(children: React.ReactNode, requestPasswordResetEmail = vi.fn(async () => ({ success: false, error: "Recusado." }))) {
  const integration = integrationFixture({ renderHumanChallenge: props => <FakeChallenge {...props} />, requestPasswordResetEmail });
  render(
    <UI integration={integration}>
      <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login }}>
        {children}
      </AuthContext.Provider>
    </UI>,
  );
  return integration;
}

beforeEach(() => {
  vi.clearAllMocks();
  mounts = 0;
});

test("login waits for a challenge token, sends it once and requires a fresh one after a refusal", async () => {
  login.mockResolvedValue({ success: false, error: "Confirme que você não é um robô e tente novamente." });
  const user = userEvent.setup();
  renderWithChallenge(<LoginForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={vi.fn()} onForgotPassword={vi.fn()} onSwitchToRegister={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Aguarde a verificação de segurança");

  await user.click(screen.getByRole("button", { name: "Verificar" }));
  expect(screen.getByRole("status")).toHaveTextContent("");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(login).toHaveBeenCalledWith(expect.objectContaining({ data: { email: "ana@example.com", password: "safe-fixture-password", challengeToken: "login-token-1" } }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Confirme que você não é um robô");
  expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Verificar" }));
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(login).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ challengeToken: "login-token-2" }) }));
});

test("registration sends the signup challenge token", async () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  login.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  renderWithChallenge(<RegisterForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Criar conta" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Verificar" }));
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(login).toHaveBeenCalledWith(expect.objectContaining({ action: "register", data: expect.objectContaining({ challengeToken: "signup-token-1" }) }));
  vi.unstubAllGlobals();
});

test("password recovery sends its own action token and renews the widget after each request", async () => {
  const user = userEvent.setup();
  const integration = renderWithChallenge(<ForgotPasswordForm email="ana@example.com" onEmailChange={vi.fn()} onSwitchToLogin={vi.fn()} />);
  const submit = screen.getByRole("button", { name: "Enviar email de recuperação" });
  expect(submit).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Verificar" }));
  await user.click(submit);
  expect(integration.requestPasswordResetEmail).toHaveBeenCalledWith({ email: "ana@example.com", challengeToken: "password-reset-token-1" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Recusado.");
  expect(mounts).toBe(2);
  expect(screen.getByRole("button", { name: "Enviar email de recuperação" })).toBeDisabled();
});

test("a challenge that cannot load leaves the decision to the server and sends no token", async () => {
  login.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  renderWithChallenge(<LoginForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={vi.fn()} onForgotPassword={vi.fn()} onSwitchToRegister={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("button", { name: "Falhar" }));
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(login).toHaveBeenCalledWith(expect.objectContaining({ data: { email: "ana@example.com", password: "safe-fixture-password", challengeToken: undefined } }));
});

test("a token after an automatic retry clears the failure, so its expiry blocks submit again", async () => {
  const user = userEvent.setup();
  renderWithChallenge(<LoginForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={vi.fn()} onForgotPassword={vi.fn()} onSwitchToRegister={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("button", { name: "Falhar" }));
  await user.click(screen.getByRole("button", { name: "Verificar" }));
  await user.click(screen.getByRole("button", { name: "Expirar" }));
  expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
});
