// @vitest-environment jsdom
import { act, render as testingRender, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AuthContext } from "../ui";
import { integrationFixture, UI } from "./uiFixture";
const clientLink = vi.fn((props: React.ComponentProps<"a">) => <a {...props} />);
const integration = integrationFixture({ Link: clientLink });
const applyEmailVerification = integration.applyEmailVerification;
import { EmailVerificationAction } from "../ui";

test("preserves the identified Ad through the native confirmation callback", async () => {
  vi.mocked(applyEmailVerification).mockResolvedValue({
    status: "confirmed",
    email: "ana@example.com",
  });
  render(
    <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) }}>
      <EmailVerificationAction code="one-use-code" continuation={{ href: "/minha-conta/verificar-email?ad=ad-1", label: "Voltar ao anúncio" }} confirmationMessage="Seu anúncio continua como você deixou." />
    </AuthContext.Provider>,
  );

  expect(await screen.findByRole("link", { name: "Voltar ao anúncio" })).toHaveAttribute(
    "href",
    "/minha-conta/verificar-email?ad=ad-1",
  );
});

test("redacts callback parameters while preserving navigation state and awaiting session synchronization", async () => {
  const confirmation = deferred<Awaited<ReturnType<typeof applyEmailVerification>>>();
  const session = deferred<null>();
  const refreshSession = vi.fn(() => session.promise);
  vi.mocked(applyEmailVerification).mockReturnValueOnce(confirmation.promise);
  const navigationState = { callback: "confirmation" };
  window.history.replaceState(navigationState, "", "/minha-conta/acao?oobCode=one-use-code");
  const replaceState = vi.spyOn(window.history, "replaceState");

  render(
    <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }), refreshSession }}>
      <EmailVerificationAction code="one-use-code" continuation={{ href: "/minha-conta/verificar-email?ad=ad-1", label: "Voltar ao anúncio" }} confirmationMessage="Seu anúncio continua como você deixou." />
    </AuthContext.Provider>,
  );
  expect(replaceState).toHaveBeenCalledWith(navigationState, "", "/minha-conta/acao");
  expect(window.location.search).toBe("");
  expect(window.history.state).toEqual(navigationState);
  await act(async () => confirmation.resolve({ status: "confirmed", email: "ana@example.com" }));
  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(screen.getByRole("heading", { name: "Confirmando seu e-mail..." })).toBeVisible();
  await act(async () => session.resolve(null));
  expect(await screen.findByRole("link", { name: "Voltar ao anúncio" })).toHaveAttribute("href", "/minha-conta/verificar-email?ad=ad-1");
});

test("preserves successful confirmation when session synchronization fails", async () => {
  vi.mocked(applyEmailVerification).mockResolvedValueOnce({
    status: "confirmed",
    email: "ana@example.com",
  });
  const refreshSession = vi.fn().mockRejectedValueOnce(new Error("session unavailable"));
  window.history.replaceState({ callback: "confirmation" }, "", "/minha-conta/acao?oobCode=one-use-code");
  render(
    <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }), refreshSession }}>
      <EmailVerificationAction code="one-use-code" continuation={{ href: "/minha-conta/verificar-email?ad=ad-1", label: "Voltar ao anúncio" }} confirmationMessage="Seu anúncio continua como você deixou." />
    </AuthContext.Provider>,
  );
  expect(await screen.findByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível atualizar sua sessão.");
  expect(screen.getByRole("link", { name: "Voltar ao anúncio" })).toHaveAttribute("href", "/minha-conta/verificar-email?ad=ad-1");
  expect(refreshSession).toHaveBeenCalledOnce();
  expect(integration.reportSessionWaitExpired).not.toHaveBeenCalled();
  expect(window.location.search).toBe("");
});

test("bounds the confirmation wait when session synchronization never settles", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(applyEmailVerification).mockResolvedValueOnce({ status: "confirmed", email: "ana@example.com" });
    const refreshSession = vi.fn(() => new Promise<null>(() => {}));
    clientLink.mockClear();
    render(
      <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }), refreshSession }}>
        <EmailVerificationAction code="one-use-code" continuation={{ href: "/minha-conta/verificar-email?ad=ad-1", label: "Voltar ao anúncio" }} confirmationMessage="Seu anúncio continua como você deixou." />
      </AuthContext.Provider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Confirmando seu e-mail..." })).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível atualizar sua sessão.");
    expect(screen.getByRole("link", { name: "Voltar ao anúncio" })).toHaveAttribute("href", "/minha-conta/verificar-email?ad=ad-1");
    expect(screen.getByRole("alert")).toHaveTextContent("a página será carregada novamente");
    expect(clientLink).not.toHaveBeenCalled();
    expect(integration.reportSessionWaitExpired).toHaveBeenCalledOnce();
    expect(integration.reportSessionWaitExpired).toHaveBeenCalledWith(expect.any(String));
    expect(vi.getTimerCount()).toBe(0);
  }
  finally {
    vi.useRealTimers();
  }
});

test("redacts callback parameters even when confirmation fails", async () => {
  vi.mocked(applyEmailVerification).mockRejectedValueOnce(new Error("provider unavailable"));
  window.history.replaceState(null, "", "/minha-conta/acao?oobCode=one-use-code");
  const replaceState = vi.spyOn(window.history, "replaceState");
  render(
    <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) }}>
      <EmailVerificationAction code="one-use-code" continuation={{ href: "/minha-conta/verificar-email?ad=ad-1", label: "Voltar ao anúncio" }} confirmationMessage="Seu anúncio continua como você deixou." />
    </AuthContext.Provider>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível confirmar agora.");
  expect(replaceState).toHaveBeenCalledWith(null, "", window.location.pathname);
  expect(window.location.search).toBe("");
});

function render(children: React.ReactNode) {
  return testingRender(<UI integration={integration}>{children}</UI>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
