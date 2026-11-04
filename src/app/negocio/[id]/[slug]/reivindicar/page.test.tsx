// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import BusinessClaimPage from "./page";

const state = vi.hoisted(() => ({ released: true, claimable: true }));

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

beforeEach(() => {
  state.released = true;
  state.claimable = true;
});

const page = (slug = "cafe-com-arte") => BusinessClaimPage({
  params: Promise.resolve({ id: "business-id", slug }),
  searchParams: Promise.resolve({}),
});

test("a released claim explains how the owner takes over a claimable business", async () => {
  render(await page());

  expect(screen.getByRole("heading", { level: 1, name: "Assumir a página de Café com Arte" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("A confirmação do contato ainda está em preparação.");
  expect(screen.getByRole("link", { name: "Voltar para Café com Arte" })).toHaveAttribute("href", "/negocio/business-id/cafe-com-arte");
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
