// @vitest-environment jsdom
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AdForm from "./AdForm";
import { AdFormProvider } from "../contexts/AdFormContext";
import { AuthContext } from "@/features/authentication/AuthContext";
import { LoginModalContext } from "@/features/authentication/LoginModalContext";
import { installDomPolyfills, mockActions, mockCategories } from "./AdForm.fixtures";

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

describe("AdForm login for unauthenticated visitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDomPolyfills();
  });

  it("opens login modal when unauthenticated visitor submits with valid content", async () => {
    const user = userEvent.setup();
    const mockOpenLoginModal = vi.fn();

    render(
      // @ts-expect-error - partial mock
      <AuthContext.Provider value={{ user: null, isAdmin: false, loading: false }}>
        <LoginModalContext.Provider value={{ openLoginModal: mockOpenLoginModal, closeLoginModal: vi.fn(), registerDefaultOnSuccess: () => () => undefined }}>
          <AdFormProvider profiles={[]} categories={mockCategories} actions={mockActions}>
            <AdForm />
          </AdFormProvider>
        </LoginModalContext.Provider>
      </AuthContext.Provider>,
    );

    await user.type(screen.getByLabelText("Título do Anúncio"), "Meu Anúncio");

    const categoryTrigger = screen.getAllByRole("combobox")[0];
    await user.click(categoryTrigger);
    await user.click(screen.getByRole("option", { name: "Veículos" }));

    const subcategoryTrigger = screen.getAllByRole("combobox")[1];
    await user.click(subcategoryTrigger);
    await user.click(screen.getByRole("option", { name: "Carros" }));

    await user.type(screen.getByLabelText("Texto do Anúncio"), "Descrição detalhada do anúncio aqui.");

    const submitBtn = screen.getByRole("button", { name: "Publicar Anúncio" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockOpenLoginModal).toHaveBeenCalledTimes(1);
    });
    expect(mockActions.createAd).not.toHaveBeenCalled();
  });

  it("shows login-required message after modal is dismissed without authenticating", async () => {
    const user = userEvent.setup();
    let capturedOnDismiss: (() => void) | undefined;
    const mockOpenLoginModal = vi.fn((_, onDismiss?: () => void) => {
      capturedOnDismiss = onDismiss;
    });

    render(
      // @ts-expect-error - partial mock
      <AuthContext.Provider value={{ user: null, isAdmin: false, loading: false }}>
        <LoginModalContext.Provider value={{ openLoginModal: mockOpenLoginModal, closeLoginModal: vi.fn(), registerDefaultOnSuccess: () => () => undefined }}>
          <AdFormProvider profiles={[]} categories={mockCategories} actions={mockActions}>
            <AdForm />
          </AdFormProvider>
        </LoginModalContext.Provider>
      </AuthContext.Provider>,
    );

    await user.type(screen.getByLabelText("Título do Anúncio"), "Meu Anúncio");

    const categoryTrigger = screen.getAllByRole("combobox")[0];
    await user.click(categoryTrigger);
    await user.click(screen.getByRole("option", { name: "Veículos" }));

    const subcategoryTrigger = screen.getAllByRole("combobox")[1];
    await user.click(subcategoryTrigger);
    await user.click(screen.getByRole("option", { name: "Carros" }));

    await user.type(screen.getByLabelText("Texto do Anúncio"), "Descrição detalhada do anúncio aqui.");

    await user.click(screen.getByRole("button", { name: "Publicar Anúncio" }));

    await waitFor(() => expect(mockOpenLoginModal).toHaveBeenCalledTimes(1));

    // Simulate modal dismiss (onDismiss callback)
    act(() => capturedOnDismiss?.());

    expect(
      await screen.findByText("Você precisa entrar para publicar. Seus dados continuam aqui enquanto você estiver nesta página."),
    ).toBeInTheDocument();
  });

  it("does not open login modal when unauthenticated visitor submits with invalid content", async () => {
    const user = userEvent.setup();
    const mockOpenLoginModal = vi.fn();

    render(
      // @ts-expect-error - partial mock
      <AuthContext.Provider value={{ user: null, isAdmin: false, loading: false }}>
        <LoginModalContext.Provider value={{ openLoginModal: mockOpenLoginModal, closeLoginModal: vi.fn(), registerDefaultOnSuccess: () => () => undefined }}>
          <AdFormProvider profiles={[]} categories={mockCategories} actions={mockActions}>
            <AdForm />
          </AdFormProvider>
        </LoginModalContext.Provider>
      </AuthContext.Provider>,
    );

    // Submit without filling any fields
    await user.click(screen.getByRole("button", { name: "Publicar Anúncio" }));

    expect(await screen.findByText("O título do anúncio é obrigatório")).toBeInTheDocument();
    expect(mockOpenLoginModal).not.toHaveBeenCalled();
  });
});
