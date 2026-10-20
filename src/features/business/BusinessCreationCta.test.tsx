// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthContext, type AuthContextType } from "@/features/authentication/AuthContext";
import { LoginModalContext } from "@/features/authentication/LoginModalContext";
import { BusinessCreationCta } from "./BusinessCreationCta";

const mocks = vi.hoisted(() => ({ push: vi.fn(), openLoginModal: vi.fn(), capture: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));

const baseAuth: AuthContextType = {
  user: null,
  isAdmin: false,
  isEditor: false,
  loading: false,
  logout: vi.fn(),
  login: vi.fn(),
};

function renderCta(auth: Partial<AuthContextType> = {}) {
  return render(
    <LoginModalContext.Provider value={{
      openLoginModal: mocks.openLoginModal,
      closeLoginModal: vi.fn(),
      registerDefaultOnSuccess: () => () => undefined,
    }}
    >
      <AuthContext.Provider value={{ ...baseAuth, ...auth }}>
        <BusinessCreationCta />
      </AuthContext.Provider>
    </LoginModalContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", undefined);
});

test("shows the catalog invitation and returns a visitor to creation after login", async () => {
  renderCta();

  expect(screen.getByRole("heading", { name: "Comece o cadastro do seu negócio" })).toBeVisible();
  expect(mocks.capture).toHaveBeenCalledWith("business_creation_cta_viewed", {
    source_surface: "catalog",
    cta_variant: "create_business",
  });

  await userEvent.click(screen.getByRole("button", { name: "Criar negócio" }));
  expect(mocks.capture).toHaveBeenCalledWith("business_creation_cta_clicked", {
    source_surface: "catalog",
    cta_variant: "create_business",
    authentication_state: "visitor",
  });
  expect(mocks.openLoginModal).toHaveBeenCalledOnce();
  expect(mocks.openLoginModal).toHaveBeenCalledWith(
    expect.any(Function),
    undefined,
    "create-business",
    undefined,
  );
  expect(mocks.push).not.toHaveBeenCalled();

  mocks.openLoginModal.mock.calls[0][0]();
  expect(mocks.push).toHaveBeenCalledWith("/minha-conta/perfis/novo?origem=catalogo");
});

test("sends an authenticated person directly to business creation", async () => {
  renderCta({ user: { uid: "owner", email: null } });

  await userEvent.click(screen.getByRole("button", { name: "Criar negócio" }));

  expect(mocks.openLoginModal).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledWith("/minha-conta/perfis/novo?origem=catalogo");
  expect(mocks.capture).toHaveBeenCalledWith("business_creation_cta_clicked", {
    source_surface: "catalog",
    cta_variant: "create_business",
    authentication_state: "authenticated",
  });
});

test("counts exposure only when the invitation enters the viewport", () => {
  let notify: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {
      notify = callback;
    }

    observe() {}
    disconnect = disconnect;
  });

  renderCta();
  expect(mocks.capture).not.toHaveBeenCalled();

  const entry = { isIntersecting: true } as IntersectionObserverEntry;
  notify([entry], {} as IntersectionObserver);
  notify([entry], {} as IntersectionObserver);

  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    "business_creation_cta_viewed",
    { source_surface: "catalog", cta_variant: "create_business" },
  );
  expect(disconnect).toHaveBeenCalled();
});
