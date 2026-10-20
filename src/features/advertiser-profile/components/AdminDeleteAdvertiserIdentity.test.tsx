// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AdminDeleteAdvertiserIdentity } from "./AdminDeleteAdvertiserIdentity";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("../actions/adminDeleteAdvertiserIdentity", () => ({ previewAdminAdvertiserIdentityDeletion: mocks.preview, adminDeleteAdvertiserIdentity: mocks.remove }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({ profileId: "profile", title: "Oficina", ads: [{ id: "ad", title: "Reparo", status: "active" }], catalogItems: [{ id: "offering", name: "Consulta" }], confirmationToken: "token" });
  mocks.remove.mockResolvedValue({ success: true });
});

test("shows associated content and requires the exact title and a reason", async () => {
  const user = userEvent.setup();
  render(<AdminDeleteAdvertiserIdentity profileId="profile" disabled={false} />);
  await user.click(screen.getByRole("button", { name: "Excluir perfil" }));
  await screen.findByText("Reparo");
  expect(screen.getByRole("list", { name: "Itens de catálogo que serão excluídos" })).toHaveTextContent("Consulta");
  const confirmation = screen.getByRole("button", { name: "Confirmar exclusão" });
  expect(confirmation).toBeDisabled();
  await user.type(screen.getByLabelText("Digite o nome do perfil para confirmar"), "Oficina");
  expect(confirmation).toBeDisabled();
  await user.type(screen.getByLabelText("Motivo da exclusão"), "Duplicado");
  await user.click(confirmation);
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ id: "profile", reason: "Duplicado", confirmedTitle: "Oficina", confirmationToken: "token" })));
  expect(mocks.push).toHaveBeenCalledWith("/admin/perfis");
});

test("keeps failure visible and preserves the operation key on retry", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("network"));
  const user = userEvent.setup();
  render(<AdminDeleteAdvertiserIdentity profileId="profile" disabled={false} />);
  await user.click(screen.getByRole("button", { name: "Excluir perfil" }));
  await screen.findByText("Reparo");
  await user.type(screen.getByLabelText("Digite o nome do perfil para confirmar"), "Oficina");
  await user.type(screen.getByLabelText("Motivo da exclusão"), "Duplicado");
  await user.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await screen.findByRole("alert");
  expect(mocks.push).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(2));
  expect(mocks.remove.mock.calls[1][0]).toEqual(mocks.remove.mock.calls[0][0]);
});
