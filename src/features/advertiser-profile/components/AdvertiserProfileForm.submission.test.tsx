// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import AdvertiserProfileForm from "./AdvertiserProfileForm";
import { categories, installResizeObserver } from "./AdvertiserProfileForm.fixtures";

const mocks = vi.hoisted(() => ({ push: vi.fn(), update: vi.fn(), create: vi.fn(), upload: vi.fn(), capture: vi.fn(), reminder: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../actions/updateAdvertiserProfile", () => ({
  updateAdvertiserProfile: mocks.update,
}));
vi.mock("../actions/createAdvertiserProfile", () => ({
  createAdvertiserProfile: mocks.create,
}));
vi.mock("../actions/classifyAdvertiserProfile", () => ({
  classifyAdvertiserProfile: vi.fn(),
}));
vi.mock("../actions/uploadProfilePhoto", () => ({
  uploadProfilePhoto: mocks.upload,
}));
vi.mock("@tudomacae/media/imageProcessing", () => ({
  validateImageFile: vi.fn(),
  processImage: vi.fn(),
  VALID_IMAGE_TYPES_ACCEPT: "image/*",
}));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));
vi.mock("@/features/authentication/accountReminderEvents", () => ({ notifyAccountReminderChanged: mocks.reminder }));

installResizeObserver();

beforeEach(() => {
  vi.clearAllMocks();
});

test("announces invalid business fields and focuses the first correction", async () => {
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "A");
  await user.type(screen.getByRole("textbox", { name: "Número de contato 1" }), "123");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));
  expect(screen.getByText(/Confira os campos: Nome do negócio, Número de contato 1/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Nome do negócio" })).toHaveFocus();
  expect(mocks.create).not.toHaveBeenCalled();
});

test("preserves business values after a technical failure and retries with keyboard", async () => {
  mocks.create.mockRejectedValueOnce(new Error("internal detail")).mockResolvedValueOnce({ success: true, profileId: "business-1", revision: 1 });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "Oficina do Bairro");
  await user.type(screen.getByRole("textbox", { name: "Número de contato 1" }), "22999999999");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));
  expect(await screen.findByText("Não foi possível salvar agora. Seus dados continuam aqui. Tente salvar novamente.")).toBeVisible();
  expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Nome do negócio" })).toHaveValue("Oficina do Bairro");
  const retry = screen.getByRole("button", { name: "Tentar salvar novamente" });
  await waitFor(() => expect(retry).toBeEnabled());
  await user.click(retry);
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect((mocks.create.mock.calls[0][0] as FormData).get("operationId")).toBe((mocks.create.mock.calls[1][0] as FormData).get("operationId"));
  expect(mocks.push).toHaveBeenCalledWith("/minha-conta/perfis/business-1/concluido");
});

test("shows the saved business if fields changed after an ambiguous creation result", async () => {
  mocks.create.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ success: false, outcome: "already_created", profileId: "saved-profile" });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  const title = screen.getByRole("textbox", { name: "Nome do negócio" });
  await user.type(title, "Oficina antiga");
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));
  await screen.findByText(/Não foi possível salvar agora/);
  await user.clear(title);
  await user.type(title, "Oficina nova");
  const retry = screen.getByRole("button", { name: "Tentar salvar novamente" });
  await waitFor(() => expect(retry).toBeEnabled());
  await user.click(retry);
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/Este negócio já foi criado nesta tentativa/)).toBeVisible();
  expect(title).toHaveValue("Oficina nova");
  expect(screen.getByRole("link", { name: "Abrir negócio salvo em outra aba" })).toHaveAttribute("href", "/minha-conta/perfis/saved-profile/editar");
  expect(screen.getByRole("link", { name: "Abrir negócio salvo em outra aba" })).toHaveAttribute("target", "_blank");
  expect(mocks.push).not.toHaveBeenCalled();
});

test("shows revision conflict without losing edits and requires an explicit overwrite", async () => {
  mocks.update.mockResolvedValueOnce({ success: false, outcome: "conflict", currentRevision: 3 }).mockResolvedValueOnce({ success: true, revision: 4 });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} profileId="profile-1" creationSource="catalog" initialData={{ title: "Oficina", revision: 1 }} />);
  await user.clear(screen.getByRole("textbox", { name: "Nome do negócio" }));
  await user.type(screen.getByRole("textbox", { name: "Nome do negócio" }), "Oficina renovada");
  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
  expect(await screen.findByText(/Este negócio foi alterado em outra sessão/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Nome do negócio" })).toHaveValue("Oficina renovada");
  expect(screen.getByRole("link", { name: "Abrir versão atual em outra aba" })).toHaveAttribute("target", "_blank");
  await user.click(screen.getByRole("button", { name: "Salvar minhas alterações sobre a versão atual" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
  expect((mocks.update.mock.calls[1][1] as FormData).get("expectedRevision")).toBe("3");
});

test("returns to the same Ad after correcting its associated profile", async () => {
  mocks.update.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  render(
    <AdvertiserProfileForm
      categories={categories}
      profileId="profile-1"
      returnTo="/anuncio/ad-1/editar"
      initialData={{
        title: "Anunciante",
        description: "",
        contacts: [{ number: "22999999999", isWhatsapp: true }],
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));

  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  expect(mocks.push).toHaveBeenCalledWith("/anuncio/ad-1/editar");
});

test("uploads after creation and keeps success effects when photo upload fails", async () => {
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
  mocks.create.mockResolvedValue({ success: true, profileId: "profile", revision: 1 });
  mocks.upload
    .mockResolvedValueOnce({ success: false, error: "falhou" })
    .mockResolvedValueOnce({ success: true });
  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} />);
  await user.type(screen.getByLabelText("Título do Perfil"), "Perfil novo");
  const input = document.querySelector("input[type=\"file\"]") as HTMLInputElement;
  await user.upload(input, photo);
  await user.click(screen.getByRole("button", { name: "Criar Perfil" }));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith("profile", 1, expect.any(FormData)));
  expect(mocks.reminder).toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledWith("advertiser_profile_created", expect.objectContaining({ has_new_photo: true }));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByText("O Perfil foi salvo, mas a foto não foi enviada: falhou")).toBeVisible();
  expect(screen.getByLabelText("Título do Perfil")).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Tentar enviar foto novamente" }));

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/minha-conta/perfis"));
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.upload).toHaveBeenCalledTimes(2);
});

test("attributes business creation to its entry surface from form start through completion", async () => {
  const source = "home";
  mocks.create.mockResolvedValue({ success: true, profileId: "business-1", revision: 1 });
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" entrySurface={source} />);

  expect(screen.getByRole("heading", { name: "Criar negócio" })).toBeVisible();
  expect(mocks.capture).toHaveBeenCalledWith("business_creation_form_started", {
    source_surface: source,
    cta_variant: "create_business",
  });

  await userEvent.type(screen.getByLabelText("Nome do negócio"), "Ateliê de Macaé");
  await userEvent.click(screen.getByRole("button", { name: "Criar negócio" }));

  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.capture).toHaveBeenCalledWith("advertiser_profile_created", {
    contact_count: 0,
    has_new_photo: false,
    source_surface: source,
    cta_variant: "create_business",
  });
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/minha-conta/perfis/business-1/concluido"));
});

test("keeps the created business destination after a photo upload retry", async () => {
  const image = await import("@tudomacae/media/imageProcessing");
  vi.mocked(image.validateImageFile).mockReturnValue({ isValid: true });
  const photo = new File(["photo"], "business.webp", { type: "image/webp" });
  vi.mocked(image.processImage).mockResolvedValue(photo);
  vi.stubGlobal("FileReader", class {
    result = "data:image/webp;base64,preview";
    onloadend: (() => void) | null = null;
    readAsDataURL() { this.onloadend?.(); }
  });
  mocks.create.mockResolvedValue({ success: true, profileId: "business-photo", revision: 1 });
  mocks.upload
    .mockResolvedValueOnce({ success: false, error: "falhou" })
    .mockResolvedValueOnce({ success: true });

  const user = userEvent.setup();
  render(<AdvertiserProfileForm categories={categories} creationSource="catalog" />);
  await user.type(screen.getByLabelText("Nome do negócio"), "Negócio com foto");
  await user.upload(document.querySelector("input[type=\"file\"]") as HTMLInputElement, photo);
  await user.click(screen.getByRole("button", { name: "Criar negócio" }));

  await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
  expect(mocks.push).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Tentar enviar foto novamente" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/minha-conta/perfis/business-photo/concluido"));
  expect(mocks.create).toHaveBeenCalledOnce();
});
