// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../ui";
import { UI, integrationFixture } from "./uiFixture";

const administrator = { uid: "administrator", email: "admin@example.com", emailVerified: true, isAdmin: true, isEditor: false };

function Account() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.user?.uid ?? "anonymous"}</p>
      <p>{auth.logoutError}</p>
      <button onClick={() => void auth.logout()}>Log out</button>
      <button onClick={() => void auth.refreshSession?.()}>Synchronize</button>
    </>
  );
}

async function setup(logout = vi.fn(async () => {})) {
  const readSession = vi.fn().mockResolvedValue(administrator);
  const integration = integrationFixture({ readSession, logout });
  render(<UI integration={integration}><AuthProvider><Account /></AuthProvider></UI>);
  await screen.findByText(administrator.uid);
  await waitFor(() => expect(readSession).toHaveBeenCalledOnce());
  return { integration, readSession, user: userEvent.setup() };
}

test("first signed-in synchronization identifies telemetry without refreshing the server-rendered document", async () => {
  const { integration } = await setup();
  expect(integration.telemetry.identify).toHaveBeenCalledExactlyOnceWith(administrator.uid, {});
  expect(integration.navigation.refresh).not.toHaveBeenCalled();
});

test("successful logout resets identity before refreshing server presentation", async () => {
  const { integration, user } = await setup();
  await user.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByText("anonymous");
  expect(integration.telemetry.reset).toHaveBeenCalledOnce();
  expect(integration.navigation.refresh).toHaveBeenCalledOnce();
  expect(vi.mocked(integration.telemetry.reset).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(integration.navigation.refresh).mock.invocationCallOrder[0]!);
});

test("failed logout preserves identity and server presentation", async () => {
  const { integration, user } = await setup(vi.fn(async () => {
    throw new Error("unavailable");
  }));
  await user.click(screen.getByRole("button", { name: "Log out" }));
  await screen.findByText("Não foi possível sair. Tente novamente.");
  expect(screen.getByText(administrator.uid)).toBeInTheDocument();
  expect(integration.telemetry.reset).not.toHaveBeenCalled();
  expect(integration.navigation.refresh).not.toHaveBeenCalled();
});

test("unchanged synchronization preserves presentation; confirmed identity loss resets and refreshes it", async () => {
  const { integration, readSession, user } = await setup();
  await user.click(screen.getByRole("button", { name: "Synchronize" }));
  expect(integration.navigation.refresh).not.toHaveBeenCalled();
  readSession.mockResolvedValue(null);
  await user.click(screen.getByRole("button", { name: "Synchronize" }));
  await screen.findByText("anonymous");
  expect(integration.telemetry.reset).toHaveBeenCalledOnce();
  expect(integration.navigation.refresh).toHaveBeenCalledOnce();
});

test.each([true, false])("initial anonymous synchronization rotates only a persisted identified user (%s)", async (persistedIdentity) => {
  let identified = persistedIdentity;
  const readSession = vi.fn().mockResolvedValue(null);
  const integration = integrationFixture({ readSession });
  vi.mocked(integration.telemetry.hasIdentifiedUser).mockImplementation(() => identified);
  vi.mocked(integration.telemetry.reset).mockImplementation(() => {
    identified = false;
  });
  render(<UI integration={integration}><AuthProvider><Account /></AuthProvider></UI>);
  await waitFor(() => expect(readSession).toHaveBeenCalledOnce());
  await userEvent.setup().click(screen.getByRole("button", { name: "Synchronize" }));
  await waitFor(() => expect(readSession).toHaveBeenCalledTimes(2));
  expect(integration.telemetry.reset).toHaveBeenCalledTimes(persistedIdentity ? 1 : 0);
  expect(integration.navigation.refresh).toHaveBeenCalledTimes(persistedIdentity ? 1 : 0);
  if (persistedIdentity) {
    expect(vi.mocked(integration.telemetry.reset).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(integration.navigation.refresh).mock.invocationCallOrder[0]!);
  }
});

test("failed initial synchronization preserves a persisted identified user", async () => {
  const integration = integrationFixture({ readSession: vi.fn().mockRejectedValue(new Error("unavailable")) });
  vi.mocked(integration.telemetry.hasIdentifiedUser).mockReturnValue(true);
  render(<UI integration={integration}><AuthProvider><Account /></AuthProvider></UI>);
  await waitFor(() => expect(integration.reportSessionFailure).toHaveBeenCalledExactlyOnceWith(expect.any(Error), expect.any(String), "background_refresh"));
  expect(integration.telemetry.reset).not.toHaveBeenCalled();
  expect(integration.navigation.refresh).not.toHaveBeenCalled();
});
