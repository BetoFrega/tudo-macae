// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, Mock } from "vitest";
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

describe("AdForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDomPolyfills();
  });

  it("renders correctly and auto-selects the first profile", async () => {
    renderAdForm();

    expect(screen.getByRole("heading", { name: "Publicar Anúncio" })).toBeInTheDocument();

    // Check if first profile is selected by checking the text content of the trigger
    // We target the span inside the trigger
    const triggerValue = screen.getByText("Profile 1", { selector: "span" });
    expect(triggerValue).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty form", async () => {
    const user = userEvent.setup();
    renderAdForm();

    const submitBtn = screen.getByRole("button", { name: "Publicar Anúncio" });
    await user.click(submitBtn);

    expect(await screen.findByText("O título do anúncio é obrigatório")).toBeInTheDocument();
    // Use refined selector for validation message (usually paragraph or message slot)
    expect(await screen.findByText("Selecione uma categoria", { selector: "p" })).toBeInTheDocument();
    expect(await screen.findByText("O anúncio deve ter pelo menos 10 caracteres")).toBeInTheDocument();
  });

  it("submits successfully when all fields are valid (Create)", async () => {
    const user = userEvent.setup();
    renderAdForm();

    // Fill Title
    await user.type(screen.getByLabelText("Título do Anúncio"), "Meu Anúncio de Teste");

    // Select Category (Veículos)
    // Finding triggers for Select in Shadcn:
    // They are buttons with role="combobox".
    // 1st is Profile (value="Profile 1")
    // 2nd is Category
    // 3rd is Subcategory
    const triggers = screen.getAllByRole("combobox");
    const categoryTrigger = triggers[1];
    await user.click(categoryTrigger);
    await user.click(screen.getByRole("option", { name: "Veículos" }));

    // Trigger 3: Subcategory (now enabled)
    const subcategoryTrigger = screen.getAllByRole("combobox")[2];
    await user.click(subcategoryTrigger);
    await user.click(screen.getByRole("option", { name: "Carros" }));

    // Fill Text
    await user.type(screen.getByLabelText("Texto do Anúncio"), "A detailed description of the product for sale.");

    // Submit
    const submitBtn = screen.getByRole("button", { name: "Publicar Anúncio" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockActions.createAd).toHaveBeenCalledTimes(1);
    });

    // Check FormData content
    const formData = (mockActions.createAd as Mock).mock.calls[0][0] as FormData;
    expect(formData.get("title")).toBe("Meu Anúncio de Teste");
    expect(formData.get("categoryId")).toBe("cat-1");
    expect(formData.get("subcategoryId")).toBe("sub-1");
    expect(formData.get("advertiserProfileId")).toBe("prof-1");
    expect(formData.get("text")).toBe("A detailed description of the product for sale.");
  });

  it("populates form and calls updateAd in edit mode", async () => {
    const user = userEvent.setup();
    const initialData = {
      categoryId: "cat-1",
      subcategoryId: "sub-1",
      title: "Anúncio Existente",
      text: "Descrição do anúncio existente com mais de 10 chars",
      advertiserProfileId: "prof-2",
      status: "active" as const,
      images: [],
    };

    renderAdForm({ adId: "ad-existing", initialData });

    expect(screen.getByRole("heading", { name: "Editar Anúncio" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Anúncio Existente")).toBeInTheDocument();
    expect(screen.getByText("Profile 2", { selector: "span" })).toBeInTheDocument(); // Profile 2 selected

    // Submit update
    const saveBtn = screen.getByRole("button", { name: "Salvar Alterações" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockActions.updateAd).toHaveBeenCalledTimes(1);
    });

    const [adId, formData] = (mockActions.updateAd as Mock).mock.calls[0];
    expect(adId).toBe("ad-existing");
    expect(formData.get("title")).toBe("Anúncio Existente");
    expect(formData.get("status")).toBe("active");
  });
});
