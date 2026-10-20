// @vitest-environment jsdom
import { act, render as testingRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AuthContext, type EmailVerificationOperations, type EmailVerificationContent } from "../ui";
import { EmailVerificationScreen } from "../ui";
import { integrationFixture, UI } from "./uiFixture";
const integration = integrationFixture();
const operations: EmailVerificationOperations = {
  read: vi.fn(async () => null), send: vi.fn(), correct: vi.fn(),
};
const content: EmailVerificationContent = {
  verifiedMessage: "E-mail confirmado.", unverifiedMessage: "Confirme seu e-mail.", defaultDestination: "/minha-conta/anuncios",
  destinationLabel: () => "Voltar ao anúncio",
};
const sendEmailVerification = operations.send;
const readEmailVerificationFromBrowser = operations.read;

test("a failed send stays visible and does not present the account as confirmed", async () => {
  vi.mocked(readEmailVerificationFromBrowser).mockResolvedValue({ uid: "ana", email: "ana@example.com", emailVerified: false, nextSendAt: 0, destination: "/minha-conta/anuncios" });
  vi.mocked(sendEmailVerification).mockResolvedValue({ status: "error", error: "Não foi possível enviar. Tente novamente." });
  render(<AuthContext.Provider value={{ user: { uid: "ana", email: "ana@example.com", emailVerified: false }, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) }}><EmailVerificationScreen operations={operations} content={content} /></AuthContext.Provider>);
  await userEvent.click(await screen.findByRole("button", { name: "Enviar e-mail" }, { timeout: 5000 }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível enviar");
  expect(screen.getByRole("heading", { name: "Confirme seu e-mail" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Continuar publicação" })).toBeNull();
});

test("a successful send announces its status once", async () => {
  vi.mocked(readEmailVerificationFromBrowser)
    .mockResolvedValueOnce({
      uid: "ana",
      email: "ana@example.com",
      emailVerified: false,
      nextSendAt: 0,
      destination: "/minha-conta/anuncios",
    })
    .mockResolvedValueOnce({
      uid: "ana",
      email: "ana@example.com",
      emailVerified: false,
      nextSendAt: Date.now() + 60_000,
      destination: "/minha-conta/anuncios",
    });
  vi.mocked(sendEmailVerification).mockResolvedValue({
    status: "sent",
    nextSendAt: Date.now() + 60_000,
  });

  render(<AuthContext.Provider value={{ user: { uid: "ana", email: "ana@example.com", emailVerified: false }, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) }}><EmailVerificationScreen operations={operations} content={content} /></AuthContext.Provider>);
  await userEvent.click(await screen.findByRole("button", { name: "Enviar e-mail" }, { timeout: 5000 }));

  await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(1));
  expect(screen.getByRole("status")).toHaveTextContent(
    "E-mail enviado. Confira também a pasta de spam.",
  );
});

test("keeps an owned paused Ad as the continuation after confirmation", async () => {
  let finishRead!: (value: Awaited<ReturnType<EmailVerificationOperations["read"]>>) => void;
  const pendingRead = new Promise<Awaited<ReturnType<EmailVerificationOperations["read"]>>>((resolve) => {
    finishRead = resolve;
  });
  vi.mocked(readEmailVerificationFromBrowser).mockReset().mockReturnValue(pendingRead);
  render(<AuthContext.Provider value={{ user: { uid: "ana", email: "ana@example.com", emailVerified: true }, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) }}><EmailVerificationScreen operations={operations} content={content} /></AuthContext.Provider>);

  const continuation = await screen.findByRole("link", { name: "Voltar ao anúncio" });
  expect(continuation).toHaveAttribute("href", content.defaultDestination);
  await act(async () => finishRead({ uid: "ana", email: "ana@example.com", emailVerified: true, nextSendAt: 0, destination: "/anuncio/ad-1/editar" }));
  expect(continuation).toHaveAttribute(
    "href",
    "/anuncio/ad-1/editar",
  );
  expect(readEmailVerificationFromBrowser).toHaveBeenCalledWith();
});

function render(children: React.ReactNode) {
  return testingRender(<UI integration={integration}>{children}</UI>);
}
