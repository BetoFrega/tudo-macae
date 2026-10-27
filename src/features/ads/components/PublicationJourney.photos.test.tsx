// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import PublicationJourney from "./PublicationJourney";

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

it("waits for photo processing before continuing and counts only confirmed saved photos", async () => {
  const user = userEvent.setup();
  let finishProcessing!: (file: File) => void;
  mocks.processPhoto.mockImplementation(() => new Promise<File>((resolve) => {
    finishProcessing = resolve;
  }));
  mocks.contextProfiles.mockReturnValue([{ id: "profile", title: "Ana", contacts: [{ number: "22999999999" }] }]);
  mocks.saveImages.mockImplementation(async (_id: string, payload: FormData) => ({
    success: true,
    images: JSON.parse(String(payload.get("images"))).map((image: { id: string }) => ({ ...image, path: `ad-images/pending/${image.id}.png` })),
  }));
  const preview = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pending-photo");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  try {
    render(
      <PublicationJourney initial={{
        id: "pending", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado",
        categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1, images: [],
      }}
      />,
    );
    const adButton = screen.getByRole("button", { name: /Seu anúncio/ });
    await user.click(adButton);
    await act(async () => await new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await waitFor(() => expect(adButton).toHaveFocus());
    const file = new File(["photo"], "photo.png", { type: "image/png" });
    const input = document.getElementById("image-upload")!;
    input.focus();
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.processPhoto).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Processando foto..." })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Processamento das fotos" })).toHaveTextContent("Processando foto");
    input.blur();
    await act(async () => finishProcessing(file));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole("status", { name: "Processamento das fotos" })).toHaveTextContent("Processamento encerrado");
    await user.click(screen.getByRole("button", { name: /^Publicação/ }));
    expect(screen.getByText("Fotos a publicar").nextElementSibling).toHaveTextContent("1 de 3");
    expect(screen.getByRole("status", { name: "Salvamento da publicação" })).toHaveTextContent("0 fotos salvas; as alterações nas fotos ainda não foram salvas");
    expect(mocks.saveImages).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Seu anúncio/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(screen.getByText("Verificar e-mail")).toBeVisible());
    expect(mocks.saveImages).toHaveBeenCalledOnce();
    expect(screen.getByText("Fotos a publicar").nextElementSibling).toHaveTextContent("1 de 3");
    expect(screen.getByRole("status", { name: "Salvamento da publicação" })).toHaveTextContent("1 de 1 foto salva");
  }
  finally {
    preview.mockRestore();
    scroll.mockRestore();
  }
});

it("announces the saved photo count outside the collapsed ad panel", () => {
  render(
    <PublicationJourney initial={{
      id: "pending", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado",
      categoryId: "category", subcategoryId: "subcategory", createdAt: 1,
      images: [
        { id: "first", path: "ad-images/pending/first.png", url: "/api/first", order: 0 },
        { id: "second", path: "ad-images/pending/second.png", url: "/api/second", order: 1 },
      ],
    }}
    />,
  );
  expect(screen.getByRole("status", { name: "Salvamento da publicação" })).toHaveTextContent("2 de 2 fotos salvas");
});

it("does not announce a saved removal before the photo change is persisted", async () => {
  const user = userEvent.setup();
  render(
    <PublicationJourney initial={{
      id: "pending", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado",
      categoryId: "category", subcategoryId: "subcategory", createdAt: 1,
      images: [{ id: "first", path: "ad-images/pending/first.png", url: "/api/first", order: 0 }],
    }}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Seu anúncio/ }));
  await user.click(screen.getByRole("button", { name: "Remover foto 1" }));
  expect(screen.getByRole("status", { name: "Salvamento da publicação" })).toHaveTextContent("1 foto salva; as alterações nas fotos ainda não foram salvas");
});

it("reviews and publishes photo edits, removals and additions while the saved count remains confirmed", async () => {
  const user = userEvent.setup();
  mocks.emailVerified = true;
  mocks.contextProfiles.mockReturnValue([{ id: "profile", title: "Ana", contacts: [{ number: "22999999999" }] }]);
  mocks.saveImages.mockImplementation(async (_id: string, payload: FormData) => ({
    success: true,
    images: JSON.parse(String(payload.get("images"))).map((image: { id: string }) => ({ ...image, path: `ad-images/pending/${image.id}.png` })),
  }));
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const preview = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:new-photo");
  try {
    render(
      <PublicationJourney initial={{
        id: "pending", userId: "user", title: "Bicicleta", text: "Bicicleta em bom estado",
        categoryId: "category", subcategoryId: "subcategory", advertiserProfileId: "profile", createdAt: 1,
        images: [
          { id: "first", path: "ad-images/pending/first.png", url: "/api/first", title: "Frente original", order: 0 },
          { id: "second", path: "ad-images/pending/second.png", url: "/api/second", title: "Lado removido", order: 1 },
        ],
      }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Seu anúncio/ }));
    const title = screen.getAllByRole("textbox", { name: /Título da imagem/ })[0]!;
    fireEvent.change(title, { target: { value: "Frente revisada" } });
    await user.click(screen.getByRole("button", { name: "Remover foto 2" }));
    const file = new File(["new photo"], "new.png", { type: "image/png" });
    mocks.processPhoto.mockResolvedValueOnce(file);
    fireEvent.change(document.getElementById("image-upload")!, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId("photo-counter")).toHaveTextContent("2/3"));
    fireEvent.change(screen.getAllByRole("textbox", { name: /Título da imagem/ })[1]!, { target: { value: "Nova foto" } });
    expect(screen.getByRole("status", { name: "Salvamento da publicação" })).toHaveTextContent("2 fotos salvas; as alterações nas fotos ainda não foram salvas");

    await user.click(screen.getByRole("button", { name: /^Publicação/ }));
    const review = screen.getByText("Fotos a publicar").parentElement!;
    expect(review).toHaveTextContent("2 de 3");
    expect(review).toHaveTextContent("Frente revisada · Nova foto");
    expect(review).not.toHaveTextContent("Frente original");
    expect(review).not.toHaveTextContent("Lado removido");
    expect(mocks.saveImages).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Publicar anúncio" }));

    await waitFor(() => expect(mocks.publishPending).toHaveBeenCalledOnce());
    expect(mocks.saveImages).toHaveBeenCalledOnce();
    const payload = mocks.saveImages.mock.calls[0]![1] as FormData;
    const photos = JSON.parse(String(payload.get("images")));
    expect(photos).toEqual([
      { id: "first", title: "Frente revisada", description: "", order: 0 },
      { id: expect.any(String), title: "Nova foto", description: "", order: 1 },
    ]);
    expect(payload.get("file-1")).toEqual(file);
    expect(JSON.parse(String(payload.get("observedImageIds")))).toEqual(["first", "second"]);
    expect(mocks.publishPending).toHaveBeenCalledWith("pending", expect.objectContaining({
      images: photos,
    }));
    expect(await screen.findByRole("heading", { name: "Seu anúncio está publicado" })).toBeVisible();
  }
  finally {
    scroll.mockRestore();
    preview.mockRestore();
  }
});

it("refuses a non-image file with the standard message and keeps accepting photos", async () => {
  const preview = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:accepted-photo");
  try {
    render(<PublicationJourney />);
    const input = document.getElementById("image-upload")!;
    fireEvent.change(input, { target: { files: [new File(["not-an-image"], "planilha.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF.");
    expect(screen.getByTestId("photo-counter")).toHaveTextContent("0/3");
    expect(mocks.processPhoto).not.toHaveBeenCalled();

    const photo = new File(["photo"], "bicicleta.png", { type: "image/png" });
    mocks.processPhoto.mockResolvedValueOnce(photo);
    fireEvent.change(input, { target: { files: [photo] } });
    await waitFor(() => expect(screen.getByTestId("photo-counter")).toHaveTextContent("1/3"));
    expect(screen.queryByText("Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF.")).not.toBeInTheDocument();
  }
  finally {
    preview.mockRestore();
  }
});
