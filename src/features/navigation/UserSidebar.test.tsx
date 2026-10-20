// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  AuthContext,
  type AuthContextType,
} from "@/features/authentication/AuthContext";
import { LoginModalContext } from "@/features/authentication/LoginModalContext";
import UserSidebar from "./UserSidebar";

const openLoginModal = vi.fn();
const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));

function sidebar(auth: Partial<AuthContextType>, registrationVisible = false, registrationDecision?: Promise<boolean>) {
  return (
    <LoginModalContext.Provider
      value={{ openLoginModal, closeLoginModal: vi.fn(), registerDefaultOnSuccess: () => () => undefined }}
    >
      <AuthContext.Provider
        value={{
          user: { uid: "u1", email: "alguem@example.com" },
          isAdmin: false,
          isEditor: false,
          loading: false,
          logout: vi.fn(),
          login: vi.fn(),
          ...auth,
        }}
      >
        <UserSidebar registrationVisible={registrationVisible} {...(registrationDecision ? { registrationDecision } : {})} />
      </AuthContext.Provider>
    </LoginModalContext.Provider>
  );
}

function renderSidebar(auth: Partial<AuthContextType>, registrationVisible = false, registrationDecision?: Promise<boolean>) {
  return render(sidebar(auth, registrationVisible, registrationDecision));
}

const openSheet = () =>
  userEvent.click(screen.getByRole("button", { name: "Minha conta" }));

const newsroomLink = () => screen.queryByRole("link", { name: "Blog" });
const adminLink = () => screen.queryByRole("link", { name: "Painel Admin" });

describe("UserSidebar", () => {
  test("does not reuse an enabled decision while its replacement is pending", async () => {
    const first = Promise.resolve(true);
    const view = renderSidebar({}, false, first);
    await act(async () => {
      await first;
    });
    await openSheet();
    expect(screen.getByRole("link", { name: "Cadastre seu negócio ou serviço" })).toBeVisible();
    const dialog = screen.getByRole("dialog");
    let resolve = (_visible: boolean) => {};
    const next = new Promise<boolean>((done) => {
      resolve = done;
    });
    await act(async () => {
      view.rerender(sidebar({}, false, next));
    });
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.queryByRole("link", { name: "Cadastre seu negócio ou serviço" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Criar Anúncio" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Carregando opções da conta");
    expect(screen.getByRole("button", { name: "Fechar Minha conta" })).toHaveFocus();
    await act(async () => {
      resolve(false);
      await next;
    });
    expect(screen.queryByRole("link", { name: "Cadastre seu negócio ou serviço" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar Anúncio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Fechar Minha conta" })).toHaveFocus();
  });
  test("keeps the open account and close action focused while its options resolve", async () => {
    let resolve = (_visible: boolean) => {};
    const decision = new Promise<boolean>((done) => {
      resolve = done;
    });
    capture.mockClear();
    renderSidebar({}, false, decision);
    await openSheet();
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Fechar Minha conta" });
    expect(close).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Criar Anúncio" })).not.toBeInTheDocument();
    await act(async () => {
      resolve(true);
      await decision;
    });
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("button", { name: "Fechar Minha conta" })).toBe(close);
    expect(close).toHaveFocus();
    expect(screen.getByRole("link", { name: "Cadastre seu negócio ou serviço" })).toBeVisible();
    expect(capture).toHaveBeenCalledExactlyOnceWith("business_creation_cta_viewed", {
      source_surface: "account", cta_variant: "create_business",
    });
  });
  test("focuses registration first when visible and retains the secondary ad action", async () => {
    const user = userEvent.setup();
    renderSidebar({}, true);
    await openSheet();
    const registration = screen.getByRole("link", { name: "Cadastre seu negócio ou serviço" });
    expect(registration).toHaveAttribute("href", "/minha-conta/perfis/novo?origem=catalogo&entrada=account");
    expect(registration).toHaveFocus();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("link", { name: "Criar Anúncio" })).toHaveFocus();
  });
  test("counts account registration exposure once per mount and records its click", async () => {
    capture.mockClear();
    const user = userEvent.setup();
    renderSidebar({}, true);
    expect(capture).not.toHaveBeenCalled();
    await openSheet();
    expect(capture).toHaveBeenCalledExactlyOnceWith("business_creation_cta_viewed", {
      source_surface: "account", cta_variant: "create_business",
    });
    await user.keyboard("{Escape}");
    await openSheet();
    expect(capture).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("link", { name: "Cadastre seu negócio ou serviço" }));
    expect(capture).toHaveBeenLastCalledWith("business_creation_cta_clicked", {
      source_surface: "account", cta_variant: "create_business",
      authentication_state: "authenticated",
    });
  });
  test("opens from the keyboard with logical focus and restores it after Escape", async () => {
    const user = userEvent.setup();
    renderSidebar({});

    const trigger = screen.getByRole("button", { name: "Minha conta" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const sheet = screen.getByRole("dialog");
    const firstLink = within(sheet).getByRole("link", { name: "Criar Anúncio" });
    const secondLink = within(sheet).getByRole("link", { name: "Meus Anúncios" });
    expect(firstLink).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(secondLink).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(firstLink).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("opens from Space with focus on the first useful navigation link", async () => {
    const user = userEvent.setup();
    renderSidebar({});

    screen.getByRole("button", { name: "Minha conta" }).focus();
    await user.keyboard(" ");

    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Criar Anúncio" })).toHaveFocus();
  });

  test("offers the newsroom to an editor", async () => {
    renderSidebar({ isEditor: true });
    await openSheet();

    expect(newsroomLink()).toHaveAttribute("href", "/redacao");
  });

  test("offers the blog to an administrator who is not an editor", async () => {
    renderSidebar({ isAdmin: true });
    await openSheet();

    expect(adminLink()).toBeInTheDocument();
    expect(newsroomLink()).toHaveAttribute("href", "/redacao");
  });

  test("does not offer the admin panel to an editor who is not an administrator", async () => {
    renderSidebar({ isEditor: true });
    await openSheet();

    expect(adminLink()).not.toBeInTheDocument();
  });

  test("offers both to someone holding both roles", async () => {
    renderSidebar({ isAdmin: true, isEditor: true });
    await openSheet();

    expect(newsroomLink()).toBeInTheDocument();
    expect(adminLink()).toBeInTheDocument();
  });

  test("offers neither to someone holding no role", async () => {
    renderSidebar({});
    await openSheet();

    expect(newsroomLink()).not.toBeInTheDocument();
    expect(adminLink()).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meus Anúncios" })).toBeInTheDocument();
  });

  test("asks a signed-out visitor to sign in instead of showing the sheet", async () => {
    renderSidebar({ user: null });

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(openLoginModal).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Minha conta" })).not.toBeInTheDocument();
  });
});

test("keeps the account sheet and accessible retry message visible after refused logout", async () => {
  const logout = vi.fn().mockResolvedValue(undefined);
  renderSidebar({ logout, logoutError: "Não foi possível sair. Tente novamente." });
  await openSheet();
  await userEvent.click(screen.getByRole("button", { name: "Sair" }));
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível sair. Tente novamente.");
  expect(screen.getByRole("button", { name: "Sair" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Meus Anúncios" })).toBeInTheDocument();
});
