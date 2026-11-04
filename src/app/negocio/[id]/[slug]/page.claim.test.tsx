// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { BusinessContent } from "./page";

const state = vi.hoisted(() => ({ released: false, claimable: true }));

vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  connection: async () => {},
}));
vi.mock("@/integrations/advertiser-identity/businessClaimVisibility", () => ({
  businessClaimVisible: async () => state.released,
}));
vi.mock("@/packages/classifieds-api", () => ({
  getBusinessUseCase: async ({ id }: { id: string }) => ({
    id, title: "Café com Arte", activityAreas: [], ...(state.claimable ? { isClaimable: true } : {}),
  }),
}));
vi.mock("@/packages/classifieds-api/offerings", () => ({ offeringCatalog: { readPublic: async () => null } }));
vi.mock("@/features/categories/actions/getCategories", () => ({ getCategories: async () => [] }));
vi.mock("@/features/ads/actions/listAdsByProfile", () => ({ listAdsByProfilePage: async () => ({ items: [] }) }));

beforeEach(() => {
  state.released = false;
  state.claimable = true;
});

async function renderBusiness() {
  render(await BusinessContent({
    params: Promise.resolve({ id: "business-id", slug: "cafe-com-arte" }),
    searchParams: Promise.resolve({}),
  }));
}

const invite = () => screen.queryByRole("link", { name: "Assumir esta página" });

test("a released claim invites the owner of a claimable business to its claim page", async () => {
  state.released = true;
  await renderBusiness();

  expect(screen.getByRole("heading", { level: 2, name: "É o dono? Assuma esta página" })).toBeVisible();
  expect(invite()).toHaveAttribute("href", "/negocio/business-id/cafe-com-arte/reivindicar");
});

test("an unreleased claim keeps the claimable business page unchanged", async () => {
  await renderBusiness();

  expect(invite()).not.toBeInTheDocument();
});

test("a business administered by its owner never offers the claim", async () => {
  state.released = true;
  state.claimable = false;
  await renderBusiness();

  expect(invite()).not.toBeInTheDocument();
});
