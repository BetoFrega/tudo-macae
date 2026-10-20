// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ResetPasswordForm } from "../ui";
import { integrationFixture, UI } from "./uiFixture";

test("does not skip page instructions on standalone reset", () => {
  render(<UI integration={integrationFixture()}><ResetPasswordForm oobCode="disposable-proof" /></UI>);
  expect(screen.getByLabelText("Nova Senha", { exact: true })).not.toHaveFocus();
});
test("an invalid recovery link announces the result and offers a fresh request", async () => {
  render(<UI integration={integrationFixture({ resetPassword: async () => ({ success: false, error: "INVALID_OOB_CODE" }) })}><ResetPasswordForm oobCode="disposable-invalid-proof" /></UI>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nova Senha", { exact: true }), "abc123");
  await user.click(screen.getByRole("button", { name: "Redefinir senha" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Código inválido ou expirado.");
  expect(screen.getByRole("link", { name: "Solicitar um novo link de recuperação" })).toHaveAttribute("href", "/minha-conta/recuperar-senha");
});

test("a transport failure announces retry and preserves the entered password", async () => {
  render(
    <UI integration={integrationFixture({ resetPassword: async () => {
      throw new Error("private provider diagnostic");
    } })}
    >
      <ResetPasswordForm oobCode="disposable-proof" />
    </UI>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nova Senha", { exact: true }), "abc123");
  await user.click(screen.getByRole("button", { name: "Redefinir senha" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível redefinir a senha. Tente novamente.");
  expect(screen.getByLabelText("Nova Senha", { exact: true })).toHaveValue("abc123");
  expect(screen.getByRole("button", { name: "Redefinir senha" })).toBeEnabled();
  expect(screen.queryByText("private provider diagnostic")).not.toBeInTheDocument();
});

test("announces the retry deadline without presenting the recovery link as invalid", async () => {
  render(<UI integration={integrationFixture({ resetPassword: async () => ({ success: false, retryAfter: 9 }) })}><ResetPasswordForm oobCode="disposable-proof" /></UI>);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nova Senha", { exact: true }), "abc123");
  await user.click(screen.getByRole("button", { name: "Redefinir senha" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas. Aguarde 9 segundos e tente novamente.");
  expect(screen.queryByRole("link", { name: "Solicitar um novo link de recuperação" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nova Senha", { exact: true })).toHaveValue("abc123");
});
