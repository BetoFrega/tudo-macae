// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { AdFormCategorySelect } from "./AdFormCategorySelect";
import { AdFormSchema } from "../../schemas/adFormSchema";

const mockCategories = [
  { id: "c1", name: "Veículos", isActive: true, slug: "veiculos", order: 1, subcategories: [] },
];

const mockSubcategories = [
  { id: "s1", name: "Carros", isActive: true, slug: "carros", order: 1, categoryId: "c1" }, // Added categoryId to match likely type
];

describe("AdFormCategorySelect", () => {
  // Basic mocks for Radix UI
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() { }
      unobserve() { }
      disconnect() { }
    };
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();

    // Mock getComputedStyle for Radix UI visibility checks
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = elt => originalGetComputedStyle(elt);
  });

  it("renders and handles selection", async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const form = useForm<AdFormSchema>({
        defaultValues: {
          title: "",
          text: "",
          advertiserProfileId: "",
          categoryId: "",
          subcategoryId: "",
          status: "active",
        },
      });
      const selectedCategoryId = form.watch("categoryId");
      const subcategories = selectedCategoryId === "c1" ? mockSubcategories : [];

      return (
        <Form {...form}>
          <AdFormCategorySelect
            form={form}
            activeCategories={mockCategories}
            activeSubcategories={subcategories}
            selectedCategoryId={selectedCategoryId}
          />
        </Form>
      );
    };

    render(<Wrapper />);

    expect(screen.getByText("Categoria")).toBeInTheDocument();

    // Select category
    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[0]);

    const veiculosOption = await screen.findByRole("option", { name: "Veículos" });
    await user.click(veiculosOption);

    // Select subcategory (now should be active)
    await user.click(triggers[1]);

    const carrosOption = await screen.findByRole("option", { name: "Carros" });
    await user.click(carrosOption);

    // Assert value is displayed
    expect(screen.getByText("Carros")).toBeInTheDocument();
  });
});
