// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";
import Header from "./Header";

vi.mock("next/server", () => ({
  connection: () => new Promise<void>(() => {}),
}));
vi.mock("@/features/categories/actions/getCategories", () => ({
  getCategories: vi.fn(),
}));
vi.mock("@/integrations/advertiser-identity/registrationVisibility", () => ({
  registrationVisible: () => new Promise<boolean>(() => {}),
}));
vi.mock("./NavigationIntegration", () => ({
  ContextualNavigation: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./UserSidebar", () => ({ default: () => <button>Entrar</button> }));
vi.mock("@/features/business/BusinessCreationCta", () => ({
  BusinessCreationButton: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

test("registration actions render in the initial header shell while live data is pending", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<Header />);
  const registration = [...container.querySelectorAll("header button")]
    .filter(button => button.textContent === "Cadastrar negócio ou serviço");
  expect(registration).toHaveLength(2);
});
