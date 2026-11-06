// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ClaimedBusinessPage from "./page";

const owned = vi.hoisted(() => ({ value: { id: "business", title: "Café com Arte" } as { id: string; title: string } | null }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), connection: async () => {} }));
vi.mock("next/navigation", async importOriginal => ({ ...await importOriginal<typeof import("next/navigation")>(), notFound: () => {
  throw new Error("NEXT_NOT_FOUND");
} }));
vi.mock("@/features/advertiser-profile/actions/getAdvertiserProfile", () => ({ getAdvertiserProfile: async () => owned.value }));

const page = () => ClaimedBusinessPage({ params: Promise.resolve({ businessId: "business" }), searchParams: Promise.resolve({}) });

test("the new owner is invited to publish the first Ad and check the Business", async () => {
  render(await page());

  expect(screen.getByRole("heading", { level: 1, name: "Agora você administra Café com Arte" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Publicar o primeiro anúncio" })).toHaveAttribute("href", "/publicar");
  expect(screen.getByRole("link", { name: "Conferir as informações" })).toHaveAttribute("href", "/minha-conta/perfis/business/editar");
  expect(screen.getByRole("link", { name: "Ver a página pública" })).toHaveAttribute("href", "/negocio/business/cafe-com-arte");
});

test("someone who does not own the Business cannot open its welcome", async () => {
  owned.value = null;
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
});
