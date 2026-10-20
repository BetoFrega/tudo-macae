// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { installDomPolyfills, mockActions, renderAdForm } from "./AdForm.fixtures";

// Mocks
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, @typescript-eslint/no-explicit-any
  default: (props: any) => <img {...props} alt={props.alt} />,
}));

vi.mock("@tudomacae/media/imageProcessing", () => ({
  validateImageFile: vi.fn().mockReturnValue({ isValid: true }),
  processImage: vi.fn().mockResolvedValue(new File(["blob"], "processed.jpg", { type: "image/jpeg" })),
  VALID_IMAGE_TYPES_ACCEPT: "image/*",
}));

describe("AdForm photo upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDomPolyfills();
  });

  it("announces the upload limit and retries the retained photo without saving the edit again", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.mocked(mockActions.uploadAdImage)
      .mockResolvedValueOnce({ success: false, reason: "rate_limit", error: "Aguarde 5 minutos para enviar outra foto. Se precisar, entre em contato com o suporte." })
      .mockResolvedValueOnce({ success: true });
    const user = userEvent.setup();
    renderAdForm({
      adId: "ad-existing",
      initialData: {
        categoryId: "cat-1", subcategoryId: "sub-1", title: "Anúncio Existente",
        text: "Descrição do anúncio existente com mais de 10 chars",
        advertiserProfileId: "prof-1", status: "active", images: [],
      },
    });
    const input = document.querySelector<HTMLInputElement>("#image-upload");
    expect(input).not.toBeNull();
    await user.upload(input!, new File(["photo"], "photo.png", { type: "image/png" }));
    await expect(screen.findByTestId("photo-counter")).resolves.toHaveTextContent("1/3");

    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    expect(await screen.findByRole("heading", { name: "Alterações salvas; fotos pendentes" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Uma foto ainda não foi enviada.");
    expect(screen.getByRole("status")).toHaveTextContent("photo.png");
    expect(screen.getByRole("alert")).toHaveTextContent("Aguarde 5 minutos para enviar outra foto.");
    expect(screen.getByRole("link", { name: "Ver anúncio salvo" })).toHaveAttribute("href", "/anuncio/ad-existing/anuncio-atualizado");

    await user.click(screen.getByRole("button", { name: "Tentar enviar fotos novamente" }));
    await waitFor(() => expect(mockActions.uploadAdImage).toHaveBeenCalledTimes(2));
    expect(mockActions.updateAd).toHaveBeenCalledOnce();
  });

  it("announces a rejected photo and offers editing instead of a futile retry", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.mocked(mockActions.uploadAdImage).mockResolvedValueOnce({ success: false, reason: "invalid_photo", error: "A imagem processada excede o limite de 1MB." });
    const user = userEvent.setup();
    renderAdForm({ adId: "ad-existing", initialData: {
      categoryId: "cat-1", subcategoryId: "sub-1", title: "Anúncio Existente",
      text: "Descrição do anúncio existente com mais de 10 chars", advertiserProfileId: "prof-1", images: [],
    } });
    await user.upload(document.querySelector<HTMLInputElement>("#image-upload")!, new File(["photo"], "photo.png", { type: "image/png" }));
    await expect(screen.findByTestId("photo-counter")).resolves.toHaveTextContent("1/3");
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    expect(await screen.findByRole("heading", { name: "Alterações salvas; fotos pendentes" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("A imagem processada excede o limite de 1MB.");
    expect(screen.getByRole("status")).toHaveTextContent("selecione novamente as que deseja enviar");
    const edit = screen.getByRole("link", { name: "Editar fotos do anúncio salvo" });
    expect(edit).toHaveAttribute("href", "/anuncio/ad-existing/editar");
    expect(screen.queryByRole("button", { name: "Tentar enviar fotos novamente" })).not.toBeInTheDocument();
    await user.tab();
    expect(edit).toHaveFocus();
    expect(mockActions.updateAd).toHaveBeenCalledOnce();
    expect(mockActions.uploadAdImage).toHaveBeenCalledOnce();
  });
});
