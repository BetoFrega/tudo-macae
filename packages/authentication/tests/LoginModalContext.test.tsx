// @vitest-environment jsdom
import { render as testingRender, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthContext, LoginModalProvider, useLoginModal } from "../ui";
import { UI, integrationFixture } from "./uiFixture";

function TestConsumer({
  onSuccess,
  onDismiss,
}: {
  onSuccess: (() => void) | undefined;
  onDismiss: (() => void) | undefined;
}) {
  const { openLoginModal, closeLoginModal } = useLoginModal();
  return (
    <div>
      <button onClick={() => openLoginModal(onSuccess, onDismiss)}>open</button>
      <button onClick={() => openLoginModal()}>open-default</button>
      <button onClick={closeLoginModal}>close-programmatic</button>
    </div>
  );
}

function DefaultSuccessRegistration({ callback }: { callback: () => void }) {
  const { registerDefaultOnSuccess } = useLoginModal();
  useEffect(() => registerDefaultOnSuccess(callback), [callback, registerDefaultOnSuccess]);
  return null;
}

function RemovableDefaultSuccessRegistration({ callback }: { callback: () => void }) {
  const [registered, setRegistered] = useState(true);
  return (
    <>
      {registered && <DefaultSuccessRegistration callback={callback} />}
      <button onClick={() => setRegistered(false)}>leave protected page</button>
    </>
  );
}

function setup(onSuccess?: () => void, onDismiss?: () => void, defaultOnSuccess?: () => void) {
  const user = userEvent.setup();
  render(
    <LoginModalProvider>
      {defaultOnSuccess && <DefaultSuccessRegistration callback={defaultOnSuccess} />}
      <TestConsumer onSuccess={onSuccess} onDismiss={onDismiss} />
    </LoginModalProvider>,
  );
  return { user };
}

describe("LoginModalProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("modal is not shown initially", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens modal when openLoginModal is called", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onSuccess callback and closes modal on success", async () => {
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const defaultOnSuccess = vi.fn();
    const { user } = setup(onSuccess, onDismiss, defaultOnSuccess);

    await user.click(screen.getByRole("button", { name: "open" }));
    await succeed(user);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(defaultOnSuccess).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("uses the registered page callback when the modal caller has no success callback", async () => {
    const defaultOnSuccess = vi.fn();
    const { user } = setup(undefined, undefined, defaultOnSuccess);

    await user.click(screen.getByRole("button", { name: "open-default" }));
    await succeed(user);

    expect(defaultOnSuccess).toHaveBeenCalledOnce();
  });

  it("does not run a page callback after its registration has unmounted", async () => {
    const defaultOnSuccess = vi.fn();
    const user = userEvent.setup();
    function DefaultOpenConsumer() {
      const { openLoginModal } = useLoginModal();
      return <button onClick={() => openLoginModal()}>open-default</button>;
    }

    render(
      <LoginModalProvider>
        <RemovableDefaultSuccessRegistration callback={defaultOnSuccess} />
        <DefaultOpenConsumer />
      </LoginModalProvider>,
    );
    await user.click(screen.getByRole("button", { name: "open-default" }));
    act(() => screen.getByRole("button", { name: "leave protected page", hidden: true }).click());
    await succeed(user);

    expect(defaultOnSuccess).not.toHaveBeenCalled();
  });

  it("calls onDismiss callback and closes modal when closed without authenticating", async () => {
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const { user } = setup(onSuccess, onDismiss);

    const trigger = screen.getByRole("button", { name: "open" });
    await user.click(trigger);
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it.each([
    ["the page heading", "<main><h1>Área da conta</h1></main>", "heading"],
    ["the main landmark without a heading", "<main aria-label=\"Conteúdo\"></main>", "main"],
  ])("moves focus to %s when the opener left the document", async (_name, markup, role) => {
    const opener: { current?: HTMLElement } = {};
    const { user } = setup(() => opener.current?.remove());
    document.body.insertAdjacentHTML("beforeend", markup);
    opener.current = screen.getByRole("button", { name: "open" });
    await user.click(opener.current);
    await succeed(user);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole(role)).toHaveFocus();
    document.body.querySelector("main")?.remove();
  });

  it("moves focus to the page heading when the opener leaves after the dialog closed", async () => {
    const { user } = setup();
    document.body.insertAdjacentHTML("beforeend", "<main><h1>Área da conta</h1></main>");
    const opener = screen.getByRole("button", { name: "open" });
    await user.click(opener);
    await succeed(user);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(opener).toHaveFocus();

    opener.remove();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Área da conta" })).toHaveFocus();
    });
    document.body.querySelector("main")?.remove();
  });

  it("moves focus to the active form when switching between login and registration", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "login-email");
    expect(screen.getByLabelText("Email")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Não tem conta? Criar uma nova conta" }));
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "register-email");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it("does not call onDismiss if it was not provided", async () => {
    // Should not throw when no onDismiss is given
    const { user } = setup(undefined, undefined);

    await user.click(screen.getByRole("button", { name: "open" }));
    await expect(
      user.click(screen.getByRole("button", { name: "Fechar" })),
    ).resolves.not.toThrow();
  });

  it("closes modal via closeLoginModal and triggers onDismiss", async () => {
    const onDismiss = vi.fn();
    const { user } = setup(undefined, onDismiss);

    await user.click(screen.getByRole("button", { name: "open" }));

    act(() => {
      screen.getByRole("button", { name: "close-programmatic", hidden: true }).click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("clears callbacks after success so a second open starts fresh", async () => {
    const onSuccess1 = vi.fn();
    const onDismiss1 = vi.fn();
    const onSuccess2 = vi.fn();

    const user = userEvent.setup();

    function TwoOpens() {
      const { openLoginModal } = useLoginModal();
      return (
        <div>
          <button onClick={() => openLoginModal(onSuccess1, onDismiss1)}>open1</button>
          <button onClick={() => openLoginModal(onSuccess2)}>open2</button>
        </div>
      );
    }

    render(
      <LoginModalProvider>
        <TwoOpens />
      </LoginModalProvider>,
    );

    // First open → succeed
    await user.click(screen.getByRole("button", { name: "open1" }));
    await succeed(user);
    expect(onSuccess1).toHaveBeenCalledTimes(1);

    // Second open → dismiss  — onDismiss1 must NOT fire again
    await user.click(screen.getByRole("button", { name: "open2" }));
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onDismiss1).not.toHaveBeenCalled();
    expect(onSuccess2).not.toHaveBeenCalled();
  });
});

const integration = integrationFixture();
function render(children: React.ReactNode) {
  return testingRender(<UI integration={integration}><AuthContext.Provider value={{ user: null, isAdmin: false, isEditor: false, loading: false, login: async () => ({ success: true }), logout: async () => {} }}>{children}</AuthContext.Provider></UI>);
}
async function succeed(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "ana@example.com");
  await user.type(screen.getByLabelText("Senha"), "Password123!");
  await user.click(screen.getByRole("button", { name: /^Entrar$/ }));
}
