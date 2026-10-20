// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AuthContext, LoginModal } from "../ui";
import { UI, integrationFixture } from "./uiFixture";

test("explains business creation and updates and removes an explicitly supplied login affordance", async () => {
  const login = vi.fn(async () => ({ success: true }));
  const cleanup = vi.fn();
  const install = vi.fn((_login: (email: string, password: string) => Promise<void>) => cleanup);
  const integration = integrationFixture({ installTestLogin: install, describeLogin: () => "Entre para cadastrar seu negócio." });
  const view = (operation: typeof login) => (
    <UI integration={integration}>
      <AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, login: operation, logout: async () => {} }}>
        <LoginModal isOpen purpose="create-business" onClose={vi.fn()} onSuccess={vi.fn()} />
      </AuthContext.Provider>
    </UI>
  );
  const { rerender, unmount } = render(view(login));
  expect(screen.getByText("Entre para cadastrar seu negócio.")).toBeVisible();
  await install.mock.calls[0]![0]("ana@example.com", "Password123!");
  expect(login).toHaveBeenCalledWith({ method: "email-password", action: "login", data: { email: "ana@example.com", password: "Password123!" } });
  const nextLogin = vi.fn(async () => ({ success: true }));
  rerender(view(nextLogin));
  expect(cleanup).toHaveBeenCalledOnce();
  await install.mock.calls[1]![0]("ana@example.com", "Password123!");
  expect(nextLogin).toHaveBeenCalledOnce();
  unmount();
  expect(cleanup).toHaveBeenCalledTimes(2);
});
