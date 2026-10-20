// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { UserAdListClient } from "./UserAdListClient";
import { ACCOUNT_REMINDER_CHANGED_EVENT } from "@/features/authentication/accountReminderEvents";

const mocks = vi.hoisted(() => ({
  query: "filter=pending",
  refresh: vi.fn(),
  replace: vi.fn(),
  deletePublication: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("../actions/publication", () => ({
  deletePendingPublication: mocks.deletePublication,
}));

const publications = [
  {
    id: "needs-profile",
    userId: "account",
    title: "Precisa de perfil",
    text: "Descrição",
    categoryId: "category",
    subcategoryId: "subcategory",
    createdAt: 1,
    profilePending: true,
  },
  {
    id: "ready-to-publish",
    userId: "account",
    title: "Pronto para publicar",
    text: "Descrição",
    categoryId: "category",
    subcategoryId: "subcategory",
    advertiserProfileId: "profile",
    createdAt: 2,
    profilePending: false,
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.query = "filter=pending";
  mocks.deletePublication.mockResolvedValue({ success: true });
});

it("leaves the pending publication untouched when deletion is cancelled", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<UserAdListClient ads={[]} publications={[publications[0]!]} />);

  await user.click(screen.getByRole("button", { name: "Excluir" }));

  expect(mocks.deletePublication).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
  expect(screen.getByRole("heading", { name: "Precisa de perfil" })).toBeVisible();
});

it("announces a returned deletion error and keeps retry available", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.deletePublication.mockResolvedValueOnce({ success: false, error: "Não foi possível excluir." });
  const user = userEvent.setup();
  render(<UserAdListClient ads={[]} publications={[publications[0]!]} />);

  await user.click(screen.getByRole("button", { name: "Excluir" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível excluir.");
  expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
  expect(screen.getByRole("heading", { name: "Precisa de perfil" })).toBeVisible();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("recovers from a rejected deletion and succeeds on a second attempt", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const event = vi.spyOn(window, "dispatchEvent");
  mocks.deletePublication
    .mockRejectedValueOnce(new Error("network unavailable"))
    .mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  render(<UserAdListClient ads={[]} publications={[publications[0]!]} />);

  await user.click(screen.getByRole("button", { name: "Excluir" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível excluir a publicação. Tente novamente.");
  expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: ACCOUNT_REMINDER_CHANGED_EVENT }));

  await user.click(screen.getByRole("button", { name: "Excluir" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
  expect(mocks.deletePublication).toHaveBeenCalledTimes(2);
  expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: ACCOUNT_REMINDER_CHANGED_EVENT }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("applies a changed URL filter when navigation only changes the query", () => {
  const view = render(<UserAdListClient ads={[]} publications={publications} />);
  expect(screen.getByRole("heading", { name: "Pronto para publicar" })).toBeVisible();

  mocks.query = "filter=profile";
  view.rerender(<UserAdListClient ads={[]} publications={publications} />);

  expect(screen.queryByRole("heading", { name: "Pronto para publicar" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Precisa de perfil" })).toBeVisible();
});

it("keeps button selections in the URL so the reminder CTA can override them", async () => {
  const user = userEvent.setup();
  render(<UserAdListClient ads={[]} publications={publications} />);

  await user.click(screen.getByRole("button", { name: /Perfil pendente/ }));

  expect(screen.getByRole("group", { name: "Filtrar meus anúncios" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Perfil pendente/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /^Todos/ })).toHaveAttribute("aria-pressed", "false");
  expect(mocks.replace).toHaveBeenCalledWith("/minha-conta/anuncios?filter=profile", { scroll: false });
  expect(screen.queryByRole("heading", { name: "Pronto para publicar" })).not.toBeInTheDocument();
});

it("does not resurrect a stale selection when the URL returns to an earlier filter", async () => {
  const user = userEvent.setup();
  const view = render(<UserAdListClient ads={[]} publications={publications} />);
  await user.click(screen.getByRole("button", { name: /Perfil pendente/ }));

  mocks.query = "filter=profile";
  view.rerender(<UserAdListClient ads={[]} publications={publications} />);
  mocks.query = "filter=pending";
  view.rerender(<UserAdListClient ads={[]} publications={publications} />);

  expect(screen.getByRole("heading", { name: "Pronto para publicar" })).toBeVisible();
});

it("notifies the global reminder only after a pending publication is deleted", async () => {
  const user = userEvent.setup();
  const event = vi.spyOn(window, "dispatchEvent");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<UserAdListClient ads={[]} publications={[publications[0]!]} />);

  await user.click(screen.getByRole("button", { name: "Excluir" }));

  await waitFor(() => expect(mocks.deletePublication).toHaveBeenCalledWith("needs-profile"));
  expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: ACCOUNT_REMINDER_CHANGED_EVENT }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  event.mockRestore();
});
