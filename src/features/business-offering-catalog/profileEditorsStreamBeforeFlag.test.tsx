// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { afterEach, expect, test, vi } from "vitest";
import AdminEditAdvertiserProfilePage from "@/app/admin/perfis/[id]/page";
import EditAdvertiserProfilePage from "@/app/minha-conta/(workspace)/perfis/[profileId]/editar/page";

const profile = {
  id: "business-1",
  title: "Padaria Cavaleiros",
  description: "Pães artesanais.",
  contacts: [],
  activityAreas: [],
  revision: 3,
};

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({}) }));
vi.mock("@/features/categories/actions/getCategories", () => ({ getCategoriesLive: async () => [] }));
vi.mock("@/features/advertiser-profile/actions/getAdvertiserProfile", () => ({ getAdvertiserProfile: async () => profile }));
vi.mock("@/features/advertiser-profile/actions/adminGetAdvertiserProfile", () => ({ adminGetAdvertiserProfile: async () => profile }));
vi.mock("@/features/advertiser-profile/identityTypeChoices", () => ({
  identityTypeChoices: async () => undefined,
  withCurrentIdentityType: () => undefined,
}));
// The flag provider never answers, as when PostHog hangs until its timeout.
vi.mock("@/packages/classifieds-api/offerings", () => ({ offeringCatalogAvailable: () => new Promise(() => {}) }));

afterEach(() => {
  document.body.innerHTML = "";
});

// Aborting a prerender emits every boundary that has finished and the fallback of
// every boundary still waiting, which is what the first streamed response holds.
async function shellWhileFlagPending(page: ReactNode) {
  const controller = new AbortController();
  const rendering = prerender(page, { signal: controller.signal, onError: () => {} });
  for (let turn = 0; turn < 20; turn++) await new Promise(resolve => setTimeout(resolve, 0));
  controller.abort();
  const { prelude } = await rendering;
  document.body.innerHTML = await new Response(prelude).text();
}

test.each([
  ["owner", () => EditAdvertiserProfilePage({ params: Promise.resolve({ profileId: profile.id }), searchParams: Promise.resolve({}) })],
  ["administrator", () => AdminEditAdvertiserProfilePage({ params: Promise.resolve({ id: profile.id }) })],
])("the %s profile editor renders its form while the offering catalog flag is pending", async (_, page) => {
  await shellWhileFlagPending(await page());
  expect(screen.getByRole("textbox", { name: "Título do Perfil" })).toHaveValue(profile.title);
  expect(screen.queryByRole("link", { name: "Gerenciar catálogo do negócio" })).not.toBeInTheDocument();
});
