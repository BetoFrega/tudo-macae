// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import PublicationJourney from "./PublicationJourney";
import { ACCOUNT_REMINDER_CHANGED_EVENT } from "@/features/authentication/accountReminderEvents";

const mocks = vi.hoisted(() => ({
  emailVerified: false,
  query: "",
  recoverPending: vi.fn(),
  processPhoto: vi.fn(),
  contextProfiles: vi.fn(),
  getProfiles: vi.fn(),
  savePending: vi.fn(),
  saveImages: vi.fn(),
  publishPending: vi.fn(),
  saveProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("@/features/authentication/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "user", email: "user@example.com", emailVerified: mocks.emailVerified } }),
}));
vi.mock("@/features/authentication/LoginModalContext", () => ({
  useLoginModal: () => ({ openLoginModal: vi.fn() }),
}));
vi.mock("@/features/advertiser-profile/actions/getUserAdvertiserProfiles", () => ({
  getUserAdvertiserProfiles: mocks.getProfiles,
}));
vi.mock("../actions/publication", () => ({
  savePendingPublication: mocks.savePending,
  publishPendingPublication: mocks.publishPending,
  savePublicationProfile: mocks.saveProfile,
}));
vi.mock("../client/savePendingPhotos", () => ({ savePendingPhotos: mocks.saveImages }));
vi.mock("../client/readPendingPublication", () => ({ readPendingPublication: mocks.recoverPending }));
vi.mock("@tudomacae/media/imageProcessing", async importOriginal => ({
  ...await importOriginal<typeof import("@tudomacae/media/imageProcessing")>(),
  processImage: mocks.processPhoto,
}));
vi.mock("../contexts/AdFormContext", () => ({
  useAdFormContext: () => ({ profiles: mocks.contextProfiles(), categories: [], actions: { uploadAdImage: vi.fn() } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = "";
  mocks.emailVerified = false;
  mocks.recoverPending.mockResolvedValue({ publication: null, profiles: [] });
  mocks.contextProfiles.mockReturnValue([]);
  mocks.savePending.mockResolvedValue({ success: true });
  mocks.saveImages.mockResolvedValue({ success: true, images: [] });
  mocks.saveProfile.mockResolvedValue({ success: true, profileId: "profile" });
  mocks.publishPending.mockResolvedValue({ success: true, adId: "pending", slug: "bicicleta" });
  mocks.getProfiles.mockResolvedValue([{ id: "profile", title: "Ana", contacts: [{ number: "22999999999", isWhatsapp: true }] }]);
});

it("does not append a processed photo from the previous publication after recovering another draft", async () => {
  const user = userEvent.setup();
  const first = {
    id: "first", userId: "user", title: "Primeiro anúncio", text: "Em bom estado",
    categoryId: "category", subcategoryId: "subcategory", createdAt: 1, images: [],
  };
  const second = { ...first, id: "second", title: "Segundo anúncio" };
  mocks.query = "publication=first";
  mocks.recoverPending.mockResolvedValue({ publication: second, profiles: [] });
  let finishProcessing!: (file: File) => void;
  mocks.processPhoto.mockImplementation(() => new Promise<File>((resolve) => {
    finishProcessing = resolve;
  }));
  const preview = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:first-publication-photo");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  try {
    const { rerender } = render(<PublicationJourney initial={first} />);
    await user.click(screen.getByRole("button", { name: /Seu anúncio/ }));
    const file = new File(["first photo"], "first.png", { type: "image/png" });
    fireEvent.change(document.getElementById("image-upload")!, { target: { files: [file] } });
    expect(mocks.processPhoto).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Processando foto..." })).toBeDisabled();

    mocks.query = "publication=second";
    rerender(<PublicationJourney initial={first} />);
    await waitFor(() => expect(screen.getByLabelText("Título do anúncio")).toHaveValue("Segundo anúncio"));
    expect(mocks.recoverPending).toHaveBeenCalledExactlyOnceWith("second");
    await act(async () => finishProcessing(file));

    await user.click(screen.getByRole("button", { name: /Seu anúncio/ }));
    expect(screen.getByTestId("photo-counter")).toHaveTextContent("0/3");
    expect(screen.queryByRole("img", { name: "Foto 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    expect(screen.getByRole("status", { name: "Salvamento da publicação" })).toHaveTextContent("0 de 0 fotos salvas");
  }
  finally {
    preview.mockRestore();
    scroll.mockRestore();
  }
});

it.each([
  { success: true, profileId: "shared-profile" },
  { success: false, error: "Falha exclusiva do primeiro anúncio" },
])("ignores an old profile-save result ($success) after another draft with the same profile id is recovered", async (staleResult) => {
  const user = userEvent.setup();
  const firstProfile = { id: "shared-profile", title: "Perfil A", contacts: [{ number: "22999999999", isWhatsapp: true }] };
  const secondProfile = { id: "shared-profile", title: "Perfil B", contacts: [{ number: "", isWhatsapp: true }] };
  const first = {
    id: "first", userId: "user", title: "Primeiro anúncio", text: "Em bom estado",
    categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "shared-profile", createdAt: 1, images: [],
  };
  const second = { ...first, id: "second", title: "Segundo anúncio" };
  mocks.query = "publication=first";
  mocks.contextProfiles.mockReturnValue([firstProfile]);
  mocks.recoverPending.mockResolvedValue({ publication: second, profiles: [secondProfile] });
  let finishSave!: (result: typeof staleResult) => void;
  mocks.saveProfile.mockImplementation(() => new Promise<typeof staleResult>((resolve) => {
    finishSave = resolve;
  }));
  const event = vi.spyOn(window, "dispatchEvent");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  try {
    const { rerender } = render(<PublicationJourney initial={first} />);
    await user.click(screen.getByRole("button", { name: /Quem anuncia e como entrar em contato/ }));
    await user.click(screen.getByRole("button", { name: "Editar perfil" }));
    await user.clear(screen.getByRole("textbox", { name: "Nome do anunciante" }));
    await user.type(screen.getByRole("textbox", { name: "Nome do anunciante" }), "Edição local de A");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledOnce());
    expect(mocks.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ publicationId: "first", profileId: "shared-profile", title: "Edição local de A" }));

    mocks.query = "publication=second";
    rerender(<PublicationJourney initial={first} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nome do anunciante" })).toHaveValue("Perfil B"));
    event.mockClear();
    await act(async () => finishSave(staleResult));

    expect(screen.getByRole("textbox", { name: "Nome do anunciante" })).toHaveValue("Perfil B");
    expect(screen.getByRole("textbox", { name: "Telefone 1" })).toHaveValue("");
    expect(screen.getByRole("button", { name: /Quem anuncia e como entrar em contato/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Publicar anúncio" })).not.toBeInTheDocument();
    expect(screen.queryByText("Falha exclusiva do primeiro anúncio")).not.toBeInTheDocument();
    expect(mocks.getProfiles).not.toHaveBeenCalled();
    expect(event).not.toHaveBeenCalledWith(expect.objectContaining({ type: ACCOUNT_REMINDER_CHANGED_EVENT }));
  }
  finally {
    event.mockRestore();
    scroll.mockRestore();
  }
});
