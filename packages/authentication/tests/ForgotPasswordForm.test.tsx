// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ForgotPasswordForm } from "../ui";
import { integrationFixture, UI } from "./uiFixture";

test("does not skip page instructions on standalone recovery", () => {
  render(
    <UI integration={integrationFixture()}>
      <ForgotPasswordForm email="" onEmailChange={() => undefined} onSwitchToLogin={() => undefined} />
    </UI>,
  );
  expect(screen.getByRole("textbox", { name: "Email" })).not.toHaveFocus();
});

test.each(["refused", "unavailable"])(
  "keyboard recovery announces a %s request and allows retry",
  async (state) => {
    const integration = integrationFixture({
      requestPasswordResetEmail: async () => {
        if (state === "unavailable")
          throw new Error("private provider diagnostic");
        return { success: false };
      },
    });
    render(
      <UI integration={integration}>
        <ForgotPasswordForm
          email="ana@example.com"
          onEmailChange={() => undefined}
          onSwitchToLogin={() => undefined}
        />
      </UI>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox", { name: "Email" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Erro ao enviar email de recuperação. Tente novamente.",
    );
    expect(
      screen.getByRole("button", { name: "Enviar email de recuperação" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("private provider diagnostic"),
    ).not.toBeInTheDocument();
  },
);

test("keyboard recovery announces its successful asynchronous result", async () => {
  render(
    <UI integration={integrationFixture()}>
      <ForgotPasswordForm
        email="ana@example.com"
        onEmailChange={() => undefined}
        onSwitchToLogin={() => undefined}
      />
    </UI>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("textbox", { name: "Email" }));
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Email de recuperação enviado!",
  );
});

test("keyboard recovery announces the supplied retry deadline and preserves the address", async () => {
  render(<UI integration={integrationFixture({ requestPasswordResetEmail: async () => ({ success: false, error: "Muitas tentativas. Aguarde 60 segundos e tente novamente." }) })}><ForgotPasswordForm email="ana@example.com" onEmailChange={() => undefined} onSwitchToLogin={() => undefined} /></UI>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("textbox", { name: "Email" }));
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas. Aguarde 60 segundos e tente novamente.");
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("ana@example.com");
});
