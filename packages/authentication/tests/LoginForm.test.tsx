// @vitest-environment jsdom
import { render as testingRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LoginForm, RegisterForm, AuthContext } from "../ui";

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
function render(children: React.ReactNode) {
  return testingRender(<AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login }}>{children}</AuthContext.Provider>);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

test("announces a recoverable login error, preserves entered values, and allows retry", async () => {
  login.mockResolvedValueOnce({ success: false, error: "Não foi possível entrar. Tente novamente." })
    .mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  const onSuccess = vi.fn();
  render(<LoginForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={onSuccess} onForgotPassword={vi.fn()} onSwitchToRegister={vi.fn()} />);

  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível entrar. Tente novamente.");
  expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
  expect(screen.getByLabelText("Senha")).toHaveValue("safe-fixture-password");
  expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(onSuccess).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Senha")).toHaveValue("");
});

test("announces the attempt limit and preserves values until a later successful retry", async () => {
  login.mockResolvedValueOnce({ success: false, error: "Muitas tentativas. Aguarde 10 segundos e tente novamente." }).mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  const onSuccess = vi.fn();
  render(<LoginForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={onSuccess} onForgotPassword={vi.fn()} onSwitchToRegister={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas. Aguarde 10 segundos e tente novamente.");
  expect(screen.getByLabelText("Senha")).toHaveValue("safe-fixture-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(onSuccess).toHaveBeenCalledOnce();
});

test("registration announces the attempt limit while preserving credentials and consent", async () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  login.mockResolvedValue({ success: false, error: "Muitas tentativas. Aguarde 10 segundos e tente novamente." });
  const user = userEvent.setup();
  render(<RegisterForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={vi.fn()} onSwitchToLogin={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas. Aguarde 10 segundos e tente novamente.");
  expect(screen.getByLabelText("Senha")).toHaveValue("safe-fixture-password");
  expect(screen.getByRole("checkbox")).toBeChecked();
});

test("registration requires accepting the terms before creating the account", async () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  login.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  const onSuccess = vi.fn();
  render(<RegisterForm email="ana@example.com" onEmailChange={vi.fn()} onSuccess={onSuccess} onSwitchToLogin={vi.fn()} />);
  await user.type(screen.getByLabelText("Senha"), "safe-fixture-password");
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Você precisa concordar com os Termos de Uso e Política de Privacidade.");
  expect(login).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();

  await user.click(screen.getByRole("checkbox", { name: /Termos de Uso/ }));
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(login).toHaveBeenCalledExactlyOnceWith({ method: "email-password", action: "register", data: { email: "ana@example.com", password: "safe-fixture-password", challengeToken: undefined } });
  expect(onSuccess).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
