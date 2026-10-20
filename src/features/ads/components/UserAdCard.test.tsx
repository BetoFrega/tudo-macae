// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { UserAdCard } from "./UserAdCard";

const mocks = vi.hoisted(() => ({ deleteAd: vi.fn(), refresh: vi.fn(), updateStatus: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../actions/updateAdStatus", () => ({ updateAdStatus: mocks.updateStatus }));
vi.mock("../actions/deleteAd", () => ({ deleteAd: mocks.deleteAd }));
vi.mock("./AdImage", () => ({ AdImage: () => null }));

function renderPausedCard() {
  return render(
    <UserAdCard
      id="ad-1"
      title="Bicicleta"
      slug="bicicleta"
      category="Veículos"
      subcategory="Bicicletas"
      text="Em bom estado"
      status="paused"
      createdAt={1}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

test("shows a persistent profile recovery for the same Ad", async () => {
  mocks.updateStatus.mockResolvedValue({
    success: false,
    reason: "profile",
    error: "Complete um contato válido no perfil antes de ativar o anúncio.",
    adId: "ad-1",
    advertiserProfileId: "profile-1",
  });
  const user = userEvent.setup();
  renderPausedCard();

  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Ativar" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Complete um contato válido");
  expect(screen.getByRole("link", { name: "Corrigir perfil" })).toHaveAttribute(
    "href",
    "/minha-conta/perfis/profile-1/editar?returnTo=%2Fanuncio%2Fad-1%2Feditar",
  );
  expect(screen.getByRole("link", { name: "Corrigir perfil" })).toHaveAttribute("target", "_blank");
  expect(mocks.refresh).not.toHaveBeenCalled();
});

test("prevents concurrent activation and confirms the persisted active state", async () => {
  let finish: ((value: { success: true; status: "active" }) => void) | undefined;
  mocks.updateStatus.mockReturnValue(new Promise((resolve) => {
    finish = resolve;
  }));
  const user = userEvent.setup();
  renderPausedCard();

  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  const activate = screen.getByRole("menuitem", { name: "Ativar" });
  await user.click(activate);
  await user.click(activate);
  expect(mocks.updateStatus).toHaveBeenCalledTimes(1);

  finish?.({ success: true, status: "active" });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Anúncio ativo"));
  expect(screen.getByRole("link", { name: "Ver anúncio" })).toHaveAttribute("href", "/anuncio/ad-1/bicicleta");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

test("keeps email verification recovery visible for the same Ad", async () => {
  mocks.updateStatus.mockResolvedValue({
    success: false,
    reason: "email",
    error: "Confirme seu e-mail antes de reativar o anúncio.",
    adId: "ad-1",
  });
  const user = userEvent.setup();
  renderPausedCard();

  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Ativar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("não ativa o anúncio automaticamente");
  expect(screen.getByRole("link", { name: "Verificar e-mail" })).toHaveAttribute(
    "href",
    "/minha-conta/verificar-email?ad=ad-1",
  );
});

test("keeps a technical error visible and retries the requested active state", async () => {
  mocks.updateStatus
    .mockResolvedValueOnce({
      success: false,
      reason: "technical",
      error: "O anúncio foi atualizado, mas não foi possível confirmar as listagens. Tente novamente.",
      adId: "ad-1",
    })
    .mockResolvedValueOnce({ success: true, status: "active" });
  const user = userEvent.setup();
  renderPausedCard();

  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Ativar" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("não foi possível confirmar as listagens");

  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Anúncio ativo"));
  expect(mocks.updateStatus).toHaveBeenNthCalledWith(2, "ad-1", "active");
});

test("keeps the delete confirmation open and offers a retry after failure", async () => {
  mocks.deleteAd
    .mockRejectedValueOnce(new Error("network unavailable"))
    .mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  renderPausedCard();

  await user.click(screen.getByRole("button", { name: "Abrir menu" }));
  await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
  await user.click(screen.getByRole("button", { name: "Excluir" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível excluir o anúncio");
  const retry = screen.getByRole("button", { name: "Tentar excluir novamente" });
  expect(retry).toBeEnabled();
  await user.click(retry);

  await waitFor(() => expect(mocks.deleteAd).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
