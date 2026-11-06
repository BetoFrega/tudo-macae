// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import BusinessClaimPage from "./page";

const state = vi.hoisted(() => ({
  released: true, claimable: true,
  user: { uid: "owner", emailVerified: true } as { uid: string; emailVerified: boolean } | null,
  claim: null as null | { status: "pending" | "rejected"; submittedAt: number; reason?: string },
}));

vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  connection: async () => {},
}));
vi.mock("next/navigation", async importOriginal => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/integrations/advertiser-identity/businessClaimVisibility", () => ({
  businessClaimVisible: async () => state.released,
}));
vi.mock("@/packages/classifieds-api", () => ({
  getBusinessUseCase: async ({ id }: { id: string }) => ({
    id, title: "Café com Arte", ...(state.claimable ? { isClaimable: true } : {}),
  }),
}));

vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/packages/classifieds-api/businessClaims", () => ({ businessClaims: { readOwn: async () => ({ claimable: true, claim: state.claim }) } }));
vi.mock("@/features/business-claim/BusinessClaimForm", () => ({ BusinessClaimForm: () => <form aria-label="Pedido para assumir" /> }));
vi.mock("@/features/business-claim/BusinessClaimSignIn", () => ({ BusinessClaimSignIn: () => <button type="button">Entrar para pedir</button> }));

beforeEach(() => {
  state.released = true;
  state.claimable = true;
  state.user = { uid: "owner", emailVerified: true };
  state.claim = null;
});

const page = (slug = "cafe-com-arte") => BusinessClaimPage({
  params: Promise.resolve({ id: "business-id", slug }),
  searchParams: Promise.resolve({}),
});

const claimRequest = async () => render(await page());

test("a released claim explains the review and offers a signed-in owner the request form", async () => {
  await claimRequest();

  expect(screen.getByRole("heading", { level: 1, name: "Assumir a página de Café com Arte" })).toBeVisible();
  expect(screen.getByText("Envie o CNPJ do negócio.")).toBeVisible();
  expect(screen.getByRole("form", { name: "Pedido para assumir" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para Café com Arte" })).toHaveAttribute("href", "/negocio/business-id/cafe-com-arte");
});

test("a visitor is asked to sign in before requesting", async () => {
  state.user = null;
  await claimRequest();

  expect(screen.getByRole("button", { name: "Entrar para pedir" })).toBeVisible();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test("an account without a confirmed e-mail is sent to confirm it first", async () => {
  state.user = { uid: "owner", emailVerified: false };
  await claimRequest();

  expect(screen.getByRole("link", { name: "Confirmar e-mail" })).toHaveAttribute("href", "/minha-conta/verificar-email");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test("a pending request shows when it entered review instead of a new form", async () => {
  state.claim = { status: "pending", submittedAt: Date.UTC(2026, 10, 6, 15) };
  await claimRequest();

  expect(screen.getByRole("status")).toHaveTextContent("Seu pedido está em análise desde 06/11/2026.");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test("a rejected request shows its reason and allows a new one", async () => {
  state.claim = { status: "rejected", submittedAt: 1, reason: "O CNPJ é de outra empresa." };
  await claimRequest();

  expect(screen.getByText("O CNPJ é de outra empresa.")).toBeVisible();
  expect(screen.getByRole("form", { name: "Pedido para assumir" })).toBeInTheDocument();
});

test("an unreleased claim does not exist for visitors", async () => {
  state.released = false;
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
});

test("a business administered by its owner cannot be claimed", async () => {
  state.claimable = false;
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
});

test("a stale slug moves to the canonical claim page", async () => {
  await expect(page("titulo-anterior")).rejects.toThrow("NEXT_REDIRECT /negocio/business-id/cafe-com-arte/reivindicar");
});
