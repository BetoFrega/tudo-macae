// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import BusinessClaimReviewPage from "./page";

const review = vi.hoisted(() => vi.fn());
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), connection: async () => {} }));
vi.mock("@/features/business-claim/actions", () => ({ reviewBusinessClaim: review }));
const claim = (id: string, claimantEmail: string) => ({
  id, claimantId: id, claimantEmail, status: "pending", responsibleName: `Pessoa ${id}`,
  evidence: { kind: "cnpj", cnpj: "11222333000181" }, note: "Ligue de manhã", submittedAt: Date.UTC(2026, 10, 6, 15),
});
const pending = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/packages/classifieds-api/businessClaims", () => ({ businessClaims: { listPending: async () => pending.value } }));

test("a disputed Business shows each claimant's evidence and approval needs the confirmation method", async () => {
  pending.value = [{ businessId: "business", title: "Café com Arte", revision: 2, claims: [claim("a", "a@example.test"), claim("b", "b@example.test")] }];
  review.mockResolvedValue({ status: "reviewed", outcome: "approved" });
  render(await BusinessClaimReviewPage());

  const business = screen.getByRole("region", { name: "Café com Arte" });
  expect(within(business).getByText("2 pessoas pediram este negócio. Ao aprovar uma, as outras são recusadas.")).toBeVisible();
  expect(within(business).getAllByText("11.222.333/0001-81")).toHaveLength(2);
  expect(within(business).getByText("a@example.test")).toBeVisible();
  expect(within(business).getAllByText("Ligue de manhã")).toHaveLength(2);

  const user = userEvent.setup();
  const [first] = within(business).getAllByRole("listitem");
  await user.click(within(first!).getByRole("button", { name: "Aprovar" }));
  expect(review).not.toHaveBeenCalled();
  await user.click(within(first!).getByRole("radio", { name: /Liguei para o telefone publicado/u }));
  await user.click(within(first!).getByRole("button", { name: "Aprovar" }));

  expect(Object.fromEntries(review.mock.calls[0]![1] as FormData)).toMatchObject({ businessId: "business", claimId: "a", expectedRevision: "2", outcome: "approved", verification: "published_contact_call" });
  expect(await within(first!).findByRole("status")).toHaveTextContent("Pedido aprovado. A página agora é do solicitante.");
});

test("a rejection asks for the reason the claimant will read", async () => {
  pending.value = [{ businessId: "business", title: "Café com Arte", revision: 1, claims: [claim("a", "a@example.test")] }];
  render(await BusinessClaimReviewPage());
  const user = userEvent.setup();

  await user.click(screen.getByRole("radio", { name: "Recusar" }));

  expect(screen.getByLabelText("Motivo, que a pessoa vai ler")).toBeRequired();
  expect(screen.getByRole("button", { name: "Recusar" })).toBeVisible();
  expect(screen.queryByRole("group", { name: /Como você confirmou/u })).not.toBeInTheDocument();
});

test("an empty queue says so", async () => {
  pending.value = [];
  render(await BusinessClaimReviewPage());
  expect(screen.getByRole("status")).toHaveTextContent("Nenhum pedido em análise.");
});
