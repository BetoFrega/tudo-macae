// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { AdFormProfileSelect } from "./AdFormProfileSelect";

const mockProfiles = [
  { id: "p1", title: "Profile 1", userId: "u1", description: "", createdAt: 0 },
  { id: "p2", title: "Profile 2", userId: "u1", description: "", createdAt: 0 },
];

describe("AdFormProfileSelect", () => {
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
  });

  it("renders with profiles", async () => {
    const TestComponent = () => {
      const form = useForm({ defaultValues: { advertiserProfileId: "" } });
      return (
        <Form {...form}>
          {/* @ts-expect-error mock */}
          <AdFormProfileSelect form={form} profiles={mockProfiles} profileManagementHref="/minha-conta/perfis" />
        </Form>
      );
    };

    render(<TestComponent />);

    expect(screen.getByText("Perfil do Anunciante")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administrar perfis" })).toHaveAttribute("href", "/minha-conta/perfis");

    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);

    expect(screen.getByRole("option", { name: "Profile 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Profile 2" })).toBeInTheDocument();
  });

  it("hides profile management outside the owner's account context", () => {
    const TestComponent = () => {
      const form = useForm({ defaultValues: { advertiserProfileId: "p1" } });
      return (
        <Form {...form}>
          {/* @ts-expect-error mock */}
          <AdFormProfileSelect form={form} profiles={mockProfiles} />
        </Form>
      );
    };
    render(<TestComponent />);
    expect(screen.queryByRole("link", { name: "Administrar perfis" })).not.toBeInTheDocument();
  });

  it("renders nothing when profiles is empty", () => {
    const TestComponent = () => {
      const form = useForm({ defaultValues: { advertiserProfileId: "" } });
      return (
        <Form {...form}>
          {/* @ts-expect-error mock */}
          <AdFormProfileSelect form={form} profiles={[]} />
        </Form>
      );
    };

    const { container } = render(<TestComponent />);

    expect(screen.queryByText("Perfil do Anunciante")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // The component subtree contributed by AdFormProfileSelect is empty
    expect(container.querySelector("form")).toBeNull();
  });

  it("renders nothing when there is exactly one profile", () => {
    const TestComponent = () => {
      const form = useForm({ defaultValues: { advertiserProfileId: "" } });
      return (
        <Form {...form}>
          {/* @ts-expect-error mock */}
          <AdFormProfileSelect form={form} profiles={[mockProfiles[0]]} />
        </Form>
      );
    };

    render(<TestComponent />);

    expect(screen.queryByText("Perfil do Anunciante")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("uses profile id as fallback label when title is empty", async () => {
    const profilesWithBlankTitle = [
      { id: "p1", title: "", userId: "u1", description: "", createdAt: 0 },
      { id: "p2", title: "", userId: "u1", description: "", createdAt: 0 },
    ];

    const TestComponent = () => {
      const form = useForm({ defaultValues: { advertiserProfileId: "" } });
      return (
        <Form {...form}>
          {/* @ts-expect-error mock */}
          <AdFormProfileSelect form={form} profiles={profilesWithBlankTitle} />
        </Form>
      );
    };

    render(<TestComponent />);

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    // Both profiles should fall back to "Perfil Padrão"
    const defaultLabels = screen.getAllByRole("option", { name: "Perfil Padrão" });
    expect(defaultLabels).toHaveLength(2);
  });
});
