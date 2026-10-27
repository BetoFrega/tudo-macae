// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import AdminAdvertiserProfileForm from "./AdminAdvertiserProfileForm";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), update: vi.fn(), create: vi.fn(), upload: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("../actions/adminUpdateAdvertiserProfile", () => ({ adminUpdateAdvertiserProfile: mocks.update }));
vi.mock("../actions/adminCreateClaimableAdvertiserProfile", () => ({ adminCreateClaimableAdvertiserProfile: mocks.create }));
vi.mock("../actions/adminDeleteClaimableAdvertiserProfile", () => ({ adminDeleteClaimableAdvertiserProfile: vi.fn() }));
vi.mock("../actions/adminDeleteAdvertiserIdentity", () => ({ previewAdminAdvertiserIdentityDeletion: vi.fn(), adminDeleteAdvertiserIdentity: vi.fn() }));
vi.mock("../actions/uploadProfilePhoto", () => ({ uploadProfilePhoto: mocks.upload }));
vi.mock("@tudomacae/media/imageProcessing", () => ({ validateImageFile: vi.fn(), processImage: vi.fn(), VALID_IMAGE_TYPES_ACCEPT: "image/*" }));

const categories = [{ id: "services", name: "Serviços", isActive: true, subcategories: [{ id: "repair", name: "Reparos", isActive: true }] }];
const initialData = { title: "Oficina", contacts: [{ number: "22999999999", isWhatsapp: true }], activityAreas: [{ categoryId: "services", subcategoryId: "repair" }], revision: 2 };

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  vi.clearAllMocks();
});

test("keeps administrative navigation and submits the administrative action", async () => {
  mocks.update.mockResolvedValue({ success: true, revision: 3 });
  render(<AdminAdvertiserProfileForm initialData={initialData} profileId="profile" categories={categories} />);
  expect(screen.getByRole("textbox", { name: "Número de contato 1" })).toHaveAttribute("autocomplete", "off");
  await userEvent.setup().click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("profile", expect.any(FormData)));
  expect(mocks.push).toHaveBeenCalledWith("/admin/perfis");
  expect(mocks.refresh).toHaveBeenCalled();
});

test("asks admin to add a complete pending area before saving", async () => {
  const user = userEvent.setup();
  const twoCategories = [...categories, { id: "food", name: "Comida", isActive: true, subcategories: [{ id: "snacks", name: "Lanches", isActive: true }] }];
  render(<AdminAdvertiserProfileForm initialData={initialData} profileId="profile" categories={twoCategories} />);
  await user.selectOptions(screen.getByLabelText("Categoria da área de atuação"), "food");
  await user.selectOptions(screen.getByLabelText("Subcategoria da área de atuação"), "snacks");
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Adicionar área" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Adicionar área" })).toHaveAttribute("aria-describedby", "activity-area-pending-error");
  await user.click(screen.getByRole("button", { name: "Adicionar área" }));
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
});

test("keeps a partial photo upload failure visible without navigating away", async () => {
  const image = await import("@tudomacae/media/imageProcessing");
  vi.mocked(image.validateImageFile).mockReturnValue({ isValid: true });
  const photo = new File(["photo"], "profile.webp", { type: "image/webp" });
  vi.mocked(image.processImage).mockResolvedValue(photo);
  vi.stubGlobal("FileReader", class {
    result = "data:image/webp;base64,preview";
    onloadend: (() => void) | null = null;
    readAsDataURL() {
      this.onloadend?.();
    }
  });
  mocks.update.mockResolvedValue({ success: true, revision: 3 });
  mocks.upload
    .mockResolvedValueOnce({ success: false, error: "falhou" })
    .mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  render(<AdminAdvertiserProfileForm initialData={initialData} profileId="profile" categories={categories} />);

  await user.upload(document.querySelector("input[type=\"file\"]") as HTMLInputElement, photo);
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

  await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith("profile", 3, expect.any(FormData)));
  expect(screen.getByText("O Perfil foi salvo, mas a foto não foi enviada: falhou")).toBeVisible();
  expect(screen.getByLabelText("Título do Perfil")).toBeDisabled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Tentar enviar foto novamente" }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/perfis"));
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.upload).toHaveBeenCalledTimes(2);
});

test("locks claimable source fields while retrying a saved profile photo", async () => {
  const image = await import("@tudomacae/media/imageProcessing");
  vi.mocked(image.validateImageFile).mockReturnValue({ isValid: true });
  const photo = new File(["photo"], "profile.webp", { type: "image/webp" });
  vi.mocked(image.processImage).mockResolvedValue(photo);
  vi.stubGlobal("FileReader", class {
    result = "data:image/webp;base64,preview";
    onloadend: (() => void) | null = null;
    readAsDataURL() { this.onloadend?.(); }
  });
  mocks.update.mockResolvedValue({ success: true, revision: 3 });
  mocks.upload.mockResolvedValue({ success: false, error: "falhou" });
  const user = userEvent.setup();
  render(<AdminAdvertiserProfileForm initialData={{ ...initialData, claimable: true, sourceUrl: "https://example.com/profile" }} profileId="profile" categories={categories} />);

  await user.upload(document.querySelector("input[type=\"file\"]") as HTMLInputElement, photo);
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  await screen.findByText("O Perfil foi salvo, mas a foto não foi enviada: falhou");
  expect(screen.getByRole("textbox", { name: "Fonte pública" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Conferi novamente esta fonte pública" })).toBeDisabled();
});

test("lists possible duplicates and creates the claimable profile only after explicit confirmation", async () => {
  mocks.create.mockResolvedValueOnce({ success: false, duplicates: [{ id: "existing", title: "Oficina" }], confirmationToken: "confirm" }).mockResolvedValueOnce({ success: true, profileId: "profile", revision: 1 });
  render(<AdminAdvertiserProfileForm mode="create-claimable" initialData={initialData} categories={categories} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Fonte pública"), "https://example.com/oficina");
  await user.click(screen.getByRole("button", { name: "Criar perfil público" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Encontramos perfis que podem representar o mesmo negócio.");
  const duplicate = within(alert).getByRole("link", { name: "Oficina" });
  expect(duplicate).toHaveAttribute("href", "/admin/perfis/existing");
  expect(duplicate).toHaveAttribute("target", "_blank");
  expect(mocks.create).toHaveBeenCalledOnce();
  const first = mocks.create.mock.calls[0][0] as FormData;
  expect(first.get("duplicateConfirmationToken")).toBeNull();
  expect(mocks.push).not.toHaveBeenCalled();

  await user.click(within(alert).getByRole("button", { name: "Criar mesmo assim" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  const confirmed = mocks.create.mock.calls[1][0] as FormData;
  expect(confirmed.get("duplicateConfirmationToken")).toBe("confirm");
  expect(confirmed.get("idempotencyKey")).toBe(first.get("idempotencyKey"));
  expect(confirmed.get("sourceUrl")).toBe("https://example.com/oficina");
  expect(confirmed.get("title")).toBe("Oficina");
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/admin/perfis"));
});

test("locks saving while an activity area is unavailable until the admin removes it", async () => {
  const user = userEvent.setup();
  const inactiveSubcategory = [{ ...categories[0], subcategories: [{ ...categories[0].subcategories[0], isActive: false }] }];
  render(<AdminAdvertiserProfileForm initialData={{ ...initialData, description: "Descrição preservada" }} profileId="profile" categories={inactiveSubcategory} />);

  expect(screen.getByText("Área de atuação indisponível")).toBeVisible();
  expect(screen.getByText("Remova ou substitua as áreas indisponíveis antes de salvar.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Remover área de atuação" }));

  expect(screen.queryByText("Área de atuação indisponível")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar Alterações" })).toBeEnabled();
  expect(screen.getByLabelText("Descrição (Opcional)")).toHaveValue("Descrição preservada");
});
