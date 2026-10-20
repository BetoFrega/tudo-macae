// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AuthContext } from "@/features/authentication/AuthContext";
import { canManageAd } from "../actions/canManageAd";
import { AdManagementControls } from "./AdManagementControls";

vi.mock("../actions/canManageAd", () => ({ canManageAd: vi.fn() }));
vi.mock("../actions/deleteAd", () => ({ deleteAd: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test.each([["unavailable", "allowed"], ["unavailable", "denied"], ["denied", "allowed"]] as const)("an open confirmation restores focus after %s and retry %s", async (status, retryStatus) => {
  vi.mocked(canManageAd).mockResolvedValueOnce({ status: "allowed" }).mockResolvedValueOnce({ status }).mockResolvedValueOnce({ status: retryStatus });
  const auth = { user: { uid: "holder", email: "holder@example.com" }, isAdmin: false, isEditor: false, loading: false, logout: async () => {}, login: async () => ({ success: true }) };
  const content = (
    <>
      <h2 id="ad-description-ad" tabIndex={-1}>Descrição</h2>
      <AdManagementControls adId="ad" />
    </>
  );
  const view = render(<AuthContext.Provider value={auth}>{content}</AuthContext.Provider>);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
  const dialog = screen.getByRole("dialog");
  const cancel = within(dialog).getByRole("button", { name: "Cancelar" });
  cancel.focus();
  view.rerender(<AuthContext.Provider value={{ ...auth, loading: true }}>{content}</AuthContext.Provider>);
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(cancel).toHaveFocus();
  view.rerender(<AuthContext.Provider value={{ ...auth, user: { ...auth.user } }}>{content}</AuthContext.Provider>);
  await act(async () => {});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  if (status === "unavailable") {
    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    await act(async () => {});
    if (retryStatus === "allowed") expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Descrição" })).toHaveFocus();
  }
  else expect(screen.getByRole("heading", { name: "Descrição" })).toHaveFocus();
});
