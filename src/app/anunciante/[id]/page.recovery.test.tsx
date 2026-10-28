// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { InvalidAdCursorError } from "@tudomacae/ads/publicDiscovery";
import { LegacyAdvertiser } from "./page";

vi.mock("@/features/advertiser-profile/actions/getPublicAdvertiserProfile", () => ({
  getPublicAdvertiserProfile: async (id: string) => ({ id, title: "Perfil legado" }),
}));
vi.mock("@/features/ads/actions/listAdsByProfile", () => ({
  listAdsByProfilePage: async () => {
    throw new InvalidAdCursorError();
  },
}));
vi.mock("@/features/categories/actions/getCategories", () => ({ getCategories: async () => [] }));
vi.mock("@/features/advertiser-profile/components/AdvertiserProfileHeader", () => ({
  AdvertiserProfileHeader: ({ profile }: { profile: { title: string } }) => <h1>{profile.title}</h1>,
}));

test("a rejected continuation offers the legacy advertiser's first page in place of its ads", async () => {
  render(await LegacyAdvertiser({ profileId: "profile-id", cursor: "broken" }));

  expect(screen.getByRole("heading", { level: 2, name: "Anúncios deste anunciante" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Esta página de anúncios é inválida. Volte à primeira página para continuar.");
  expect(screen.getByRole("link", { name: "Primeira página de anúncios" })).toHaveAttribute("href", "/anunciante/profile-id#anuncios");
  expect(screen.queryByRole("navigation", { name: "Páginas de anúncios" })).not.toBeInTheDocument();
});
