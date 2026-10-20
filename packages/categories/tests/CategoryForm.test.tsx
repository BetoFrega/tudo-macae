// @vitest-environment jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CategoryForm } from "@tudomacae/categories/ui";

describe("CategoryForm", () => {
  it("renders correctly with empty fields when no initialData is provided", () => {
    render(<CategoryForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/Nome/i)).toHaveValue("");
    expect(screen.getByLabelText(/Slug/i)).toHaveValue("");
    expect(screen.getByLabelText("Ordem")).toHaveValue(0);
    expect(screen.getByLabelText(/Ativo/i)).toBeChecked();
    expect(screen.getByLabelText(/Ícone/i)).toHaveValue("");
  });

  it("renders correctly with initialData", () => {
    const initialData = {
      id: "1",
      name: "Imóveis",
      slug: "imoveis",
      order: 1,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      subcategories: [],
      icon: "home",
    };

    render(<CategoryForm initialData={initialData} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/Nome/i)).toHaveValue("Imóveis");
    expect(screen.getByLabelText(/Slug/i)).toHaveValue("imoveis");
    expect(screen.getByLabelText("Ordem")).toHaveValue(1);
    expect(screen.getByLabelText(/Ativo/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Ícone/i)).toHaveValue("home");
  });

  it("edits and clears the optional business settings", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    render(
      <CategoryForm
        initialData={{
          id: "category", name: "Serviços", slug: "servicos", order: 1,
          businessOrder: 3, preferredLayer: "businesses", isActive: true, subcategories: [],
        }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText("Ordem em Negócios")).toHaveValue(3);
    expect(screen.getByLabelText("Primeira camada pública")).toHaveValue("businesses");
    fireEvent.change(screen.getByLabelText("Ordem em Negócios"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Primeira camada pública"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      businessOrder: undefined, preferredLayer: undefined,
    })));
  });

  it("calls onSubmit with correct values when form is valid", async () => {
    const onSubmit = vi.fn().mockReturnValue(Promise.resolve());
    render(<CategoryForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Nome/i), { target: { value: "Veículos" } });
    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: "veiculos" } });
    fireEvent.change(screen.getByLabelText("Ordem"), { target: { value: "2" } });

    // Uncheck "Ativo"
    fireEvent.click(screen.getByLabelText(/Ativo/i));

    fireEvent.click(screen.getByRole("button", { name: /Criar Categoria/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Veículos",
        slug: "veiculos",
        order: 2,
        businessOrder: undefined,
        preferredLayer: undefined,
        isActive: false,
        icon: "",
      });
    });
  });

  it("shows validation errors if required fields are missing", async () => {
    const onSubmit = vi.fn();
    render(<CategoryForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /Criar Categoria/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Nome é obrigatório/i)).toHaveLength(1);
      expect(screen.getAllByText(/Slug é obrigatório/i)).toHaveLength(1);
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("handles submission error and shows alert", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: false, error: "Custom Error" });
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<CategoryForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Nome/i), { target: { value: "Teste" } });
    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: "teste" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar Categoria/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
      expect(alertMock).toHaveBeenCalledWith("Custom Error");
    });

    alertMock.mockRestore();
  });

  it("disables button and shows loading state during submission", async () => {
    let resolvePromise: (value: unknown) => void = () => {};
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    const onSubmit = vi.fn().mockReturnValue(promise);

    render(<CategoryForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Nome/i), { target: { value: "Teste" } });
    fireEvent.change(screen.getByLabelText(/Slug/i), { target: { value: "teste" } });

    const button = screen.getByRole("button", { name: /Criar Categoria/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByText("Salvando...")).toBeInTheDocument();
    });

    resolvePromise({ success: true });

    await waitFor(() => {
      expect(screen.getByRole("button")).toBeEnabled();
      expect(screen.getByText("Criar Categoria")).toBeInTheDocument();
    });
  });

  it("renders correct button text for edit mode", () => {
    const initialData = {
      id: "1",
      name: "Edit",
      slug: "edit",
      order: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      subcategories: [],
    };
    render(<CategoryForm initialData={initialData} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Salvar Alterações/i })).toBeInTheDocument();
  });
});
