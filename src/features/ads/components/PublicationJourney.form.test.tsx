// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import PublicationJourney from "./PublicationJourney";
import { ACCOUNT_REMINDER_CHANGED_EVENT } from "@/features/authentication/accountReminderEvents";
import { personalProfileExistsMessage } from "@tudomacae/ads/client";

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

it("updates independent title and text counters while typing and clearing the publication form", async () => {
  const user = userEvent.setup();
  render(<PublicationJourney />);
  const title = screen.getByRole("textbox", { name: "Título do anúncio" });
  const text = screen.getByRole("textbox", { name: "Texto do anúncio" });

  expect(screen.getByText("0/140")).toBeVisible();
  expect(screen.getByText("0/1000")).toBeVisible();

  await user.type(title, "Oferta");
  expect(screen.getByText("6/140")).toBeVisible();
  expect(screen.getByText("0/1000")).toBeVisible();

  await user.type(text, "Detalhes");
  expect(screen.getByText("6/140")).toBeVisible();
  expect(screen.getByText("8/1000")).toBeVisible();

  await user.clear(title);
  expect(screen.getByText("0/140")).toBeVisible();
  expect(screen.getByText("8/1000")).toBeVisible();
  await user.clear(text);
  expect(screen.getByText("0/1000")).toBeVisible();
});

it("notifies the global reminder after the profile is saved", async () => {
  const user = userEvent.setup();
  const event = vi.spyOn(window, "dispatchEvent");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  render(
    <PublicationJourney initial={{
      id: "pending",
      userId: "user",
      title: "Bicicleta",
      text: "Em bom estado",
      categoryId: "category",
      subcategoryId: "subcategory",
      createdAt: 1,
    }}
    />,
  );

  await user.type(screen.getByRole("textbox", { name: "Nome do anunciante" }), "Ana");
  await user.type(screen.getByRole("textbox", { name: "Telefone 1" }), "22999999999");
  event.mockClear();
  await user.click(screen.getByRole("button", { name: "Criar perfil" }));

  await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledOnce());
  expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: ACCOUNT_REMINDER_CHANGED_EVENT }));
  expect(await screen.findByRole("button", { name: "Publicar anúncio" })).toBeVisible();
  event.mockRestore();
  scroll.mockRestore();
});

it("opens the refreshed profile values after another session changes the same profile id", async () => {
  const user = userEvent.setup();
  mocks.emailVerified = true;
  const previous = { id: "profile", title: "Nome anterior", contacts: [{ number: "22999999999", isWhatsapp: true }] };
  const updated = { ...previous, title: "Nome atualizado", contacts: [{ number: "22988888888", isWhatsapp: false }] };
  mocks.contextProfiles.mockReturnValue([previous]);
  mocks.getProfiles.mockResolvedValue([updated]);
  mocks.publishPending.mockResolvedValue({ success: false, error: "O perfil foi alterado em outra aba. Confira os dados atualizados antes de publicar." });
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  try {
    render(<PublicationJourney initial={{ id: "draft", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: previous.id, createdAt: 1, images: [] }} />);
    await user.click(screen.getByRole("button", { name: "Publicar anúncio" }));
    await waitFor(() => expect(mocks.getProfiles).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: /Quem anuncia e como entrar em contato/ }));
    await user.click(screen.getByRole("button", { name: "Editar perfil" }));
    expect(screen.getByRole("textbox", { name: "Nome do anunciante" })).toHaveValue(updated.title);
    expect(screen.getByRole("textbox", { name: "Telefone 1" })).toHaveValue(updated.contacts[0]!.number);
    expect(screen.getByRole("checkbox", { name: "Este número tem WhatsApp" })).not.toBeChecked();
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  }
  finally {
    scroll.mockRestore();
  }
});

it("requires an identity type before creating the profile where types are supported", async () => {
  const user = userEvent.setup();
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  try {
    render(<PublicationJourney identityTypes initial={{ id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1 }} />);
    await user.type(screen.getByRole("textbox", { name: "Nome do anunciante" }), "Ana");
    await user.type(screen.getByRole("textbox", { name: "Telefone 1" }), "22999999999");
    await user.click(screen.getByRole("button", { name: "Criar perfil" }));

    expect(screen.getByText("Escolha se este perfil é pessoal ou de um negócio.")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Meu perfil pessoal" })).toHaveFocus();
    expect(mocks.saveProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Meu perfil pessoal" }));
    await user.click(screen.getByRole("button", { name: "Criar perfil" }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ identityType: "personal", title: "Ana" })));
  }
  finally {
    scroll.mockRestore();
  }
});

it("leaves only the business choice after another session takes the personal profile", async () => {
  const user = userEvent.setup();
  mocks.saveProfile.mockResolvedValueOnce({ success: false, error: personalProfileExistsMessage });
  render(<PublicationJourney identityTypes initial={{ id: "pending", userId: "user", title: "Bicicleta", text: "Em bom estado", categoryId: "category", subcategoryId: "subcategory", createdAt: 1 }} />);
  await user.type(screen.getByRole("textbox", { name: "Nome do anunciante" }), "Ana");
  await user.type(screen.getByRole("textbox", { name: "Telefone 1" }), "22999999999");
  await user.click(screen.getByRole("radio", { name: "Meu perfil pessoal" }));
  await user.click(screen.getByRole("button", { name: "Criar perfil" }));

  await waitFor(() => expect(screen.getByRole("radio", { name: "Meu perfil pessoal" })).toBeDisabled());
  await waitFor(() => expect(screen.getByText(personalProfileExistsMessage)).toHaveFocus());
  expect(screen.getByRole("radio", { name: "Um negócio" })).not.toBeChecked();
  expect(screen.getByRole("textbox", { name: "Nome do anunciante" })).toHaveValue("Ana");
});
