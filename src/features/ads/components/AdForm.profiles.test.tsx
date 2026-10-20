// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AdForm from "./AdForm";
import { AdFormProvider } from "../contexts/AdFormContext";
import { AuthContext } from "@/features/authentication/AuthContext";
import { LoginModalContext } from "@/features/authentication/LoginModalContext";
import { fakeAuthValue, fakeLoginModalValue, installDomPolyfills, mockActions, mockCategories, mockProfiles, renderAdForm } from "./AdForm.fixtures";

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

describe("AdForm advertiser profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDomPolyfills();
  });

  it("shows identity and contact when an edited ad has one profile", () => {
    renderAdForm({
      adId: "ad-1",
      profiles: [{ ...mockProfiles[0]!, contacts: [{ number: "22999999999", isWhatsapp: true }] }],
      profileManagementHref: "/minha-conta/perfis",
      initialData: { categoryId: "cat-1", subcategoryId: "sub-1", title: "Anúncio", text: "Descrição com detalhes suficientes", advertiserProfileId: "prof-1", images: [] },
    });
    expect(screen.getByText("Profile 1")).toBeVisible();
    expect(screen.getByText("(22) 99999-9999 (WhatsApp)")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Perfil do Anunciante" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Corrigir contato do anunciante" })).toHaveAttribute("href", "/minha-conta/perfis/prof-1/editar?returnTo=%2Fanuncio%2Fad-1%2Feditar");
  });

  it("updates the visible contact when another profile is selected", async () => {
    const user = userEvent.setup();
    renderAdForm({
      adId: "ad-1",
      profiles: [{ ...mockProfiles[0]!, contacts: [{ number: "22999999999", isWhatsapp: true }] }, { ...mockProfiles[1]!, contacts: [{ number: "22888888888", isWhatsapp: false }] }],
      profileManagementHref: "/minha-conta/perfis",
      initialData: { categoryId: "cat-1", subcategoryId: "sub-1", title: "Anúncio", text: "Descrição com detalhes suficientes", advertiserProfileId: "prof-1", images: [] },
    });
    await user.click(screen.getByRole("combobox", { name: "Perfil do Anunciante" }));
    await user.click(screen.getByRole("option", { name: "Profile 2" }));
    expect(screen.getByText("(22) 88888-8888")).toBeVisible();
    const contactStatus = screen.getByRole("status");
    expect(contactStatus).toHaveTextContent("Anunciante Profile 2. Contato exibido no anúncio: (22) 88888-8888.");
    expect(screen.getByRole("combobox", { name: "Perfil do Anunciante" }).getAttribute("aria-describedby")?.split(" ")).toContain(contactStatus.id);
    expect(screen.queryByRole("link", { name: "Administrar perfis" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Corrigir contato do anunciante" })).toHaveAttribute("href", "/minha-conta/perfis/prof-2/editar?returnTo=%2Fanuncio%2Fad-1%2Feditar");
  });

  it("requires an informed choice before leaving an edited ad with unsaved changes", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderAdForm({
      adId: "ad-1",
      profiles: [mockProfiles[0]!],
      profileManagementHref: "/minha-conta/perfis",
      initialData: { categoryId: "cat-1", subcategoryId: "sub-1", title: "Anúncio", text: "Descrição com detalhes suficientes", advertiserProfileId: "prof-1", images: [] },
    });
    await user.type(screen.getByRole("textbox", { name: "Texto do Anúncio" }), " mais detalhes");
    await user.click(screen.getByRole("link", { name: "Corrigir contato do anunciante" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("alterações não salvas"));
    expect(screen.getByRole("textbox", { name: "Texto do Anúncio" })).toHaveValue("Descrição com detalhes suficientes mais detalhes");
    confirm.mockRestore();
  });

  it("does not render profile select when there are zero profiles (unauthenticated visitor)", () => {
    render(
      <AuthContext.Provider value={{ ...fakeAuthValue, user: null }}>
        <LoginModalContext.Provider value={fakeLoginModalValue}>
          <AdFormProvider profiles={[]} categories={mockCategories} actions={mockActions}>
            <AdForm />
          </AdFormProvider>
        </LoginModalContext.Provider>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "Publicar Anúncio" })).toBeInTheDocument();
    expect(screen.queryByText("Perfil do Anunciante")).not.toBeInTheDocument();
  });

  it("blocks administrative editing without sending the admin to create a personal profile", () => {
    render(
      <AuthContext.Provider value={{ ...fakeAuthValue, isAdmin: true }}>
        <LoginModalContext.Provider value={fakeLoginModalValue}>
          <AdFormProvider profiles={[]} categories={mockCategories} actions={mockActions}>
            <AdForm adId="ad-without-profile" />
          </AdFormProvider>
        </LoginModalContext.Provider>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "Anunciante sem perfil disponível" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Criar Perfil" })).not.toBeInTheDocument();
  });

  it("does not render profile select when there is exactly one profile", () => {
    render(
      <AuthContext.Provider value={fakeAuthValue}>
        <LoginModalContext.Provider value={fakeLoginModalValue}>
          <AdFormProvider
            profiles={[mockProfiles[0]]}
            categories={mockCategories}
            actions={mockActions}
          >
            <AdForm />
          </AdFormProvider>
        </LoginModalContext.Provider>
      </AuthContext.Provider>,
    );

    expect(screen.queryByText("Perfil do Anunciante")).not.toBeInTheDocument();
  });
});
