// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { AdFormImageSection } from "./AdFormImageSection";
import { useForm, FormProvider } from "react-hook-form";
import React from "react";
import { AdFormSchema } from "../../schemas/adFormSchema";

vi.mock("next/image", () => ({
  default: ({ alt, src, sizes, loader, unoptimized, onError }: { alt: string; src: string; sizes?: string; loader?: unknown; unoptimized?: boolean; onError?: React.ReactEventHandler<HTMLImageElement> }) => (
    <img
      role="img"
      aria-label={alt}
      src={src}
      sizes={sizes}
      data-loader={loader ? "custom" : "default"}
      data-unoptimized={unoptimized ? "true" : "false"}
      onError={onError}
    />
  ),
}));

describe("AdFormImageSection", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  const Wrapper = ({ children, defaultValues = {} }: { children: React.ReactNode; defaultValues?: Partial<AdFormSchema> }) => {
    const methods = useForm({
      defaultValues: {
        images: [],
        ...defaultValues,
      },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
  };

  it("renders images and inputs", async () => {
    const defaultValues = {
      images: [
        { id: "1", url: "url1", order: 0, title: "Title 1", description: "Desc 1", path: "p1" },
      ],
    };

    render(
      <Wrapper defaultValues={defaultValues}>
        <AdFormImageSection />
      </Wrapper>,
    );

    expect(screen.getByDisplayValue("Title 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Desc 1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Desc 1" })).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("delivers external originals and private pending previews directly in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    render(
      <Wrapper defaultValues={{ images: [
        { id: "stored", url: "https://example.com/photo.webp", order: 0, title: "Original", description: "Original" },
        { id: "private", url: "/api/publicacoes-pendentes/ad-1/fotos/photo-1", order: 1, title: "Privada", description: "Privada" },
        { id: "published", url: "/api/anuncios/ad-1/photo", order: 2, title: "Publicada", description: "Publicada" },
      ] }}
      >
        <AdFormImageSection />
      </Wrapper>,
    );
    expect(screen.getByRole("img", { name: "Original" })).toHaveAttribute("data-unoptimized", "true");
    expect(screen.getByRole("img", { name: "Privada" })).toHaveAttribute("src", "/api/publicacoes-pendentes/ad-1/fotos/photo-1");
    expect(screen.getByRole("img", { name: "Privada" })).toHaveAttribute("data-unoptimized", "true");
    expect(screen.getByRole("img", { name: "Publicada" })).toHaveAttribute("data-loader", "custom");
    expect(screen.getByRole("img", { name: "Publicada" })).toHaveAttribute("data-unoptimized", "false");
  });

  it("calls onRemoveImage when delete button pressed", async () => {
    const defaultValues = {
      images: [
        { id: "1", url: "url1", order: 0, title: "Title 1", description: "Desc 1", path: "p1" },
      ],
    };

    render(
      <Wrapper defaultValues={defaultValues}>
        <AdFormImageSection />
      </Wrapper>,
    );

    const deleteBtn = screen.getAllByRole("button")[0]; // Close button on the card
    await userEvent.click(deleteBtn);

    // Since we are using the real hook which uses fieldArray, 'remove' updates the internal state.
    // We can verify this by checking if the image is removed from the DOM.
    expect(screen.queryByDisplayValue("Title 1")).not.toBeInTheDocument();
  });

  it("distinguishes a selected photo from a saved pending photo", () => {
    const file = new File(["photo"], "photo.png", { type: "image/png" });
    render(
      <Wrapper defaultValues={{ images: [
        { id: "new", file, url: "data:image/png;base64,cGhvdG8=", order: 0, title: "Nova", description: "" },
        { id: "saved", path: "ad-images/ad/saved.png", url: "/api/publicacoes-pendentes/ad/fotos/saved", order: 1, title: "Salva", description: "" },
      ] }}
      >
        <AdFormImageSection showSaveStatus />
      </Wrapper>,
    );
    expect(screen.getByText("Ainda não salva. Clique em Continuar para salvar esta foto.")).toBeInTheDocument();
    expect(screen.getByText("Foto salva na publicação pendente.")).toBeInTheDocument();
  });

  it("lets the owner remove a saved photo whose upload never completed", async () => {
    render(
      <Wrapper defaultValues={{ images: [{ id: "pending", path: "ad-images/ad/pending/photo.png", pending: true, url: "", order: 0, title: "Frente", description: "" }] }}>
        <AdFormImageSection />
      </Wrapper>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Remova-a e escolha novamente");
    expect(screen.getByText("Envio incompleto")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remover foto 1" }));
    expect(screen.queryByText("Envio incompleto")).not.toBeInTheDocument();
  });

  it("does not describe an incomplete upload as saved", () => {
    render(
      <Wrapper defaultValues={{ images: [{ id: "pending", path: "ad-images/ad/pending/photo.png", pending: true, url: "", order: 0, title: "Frente", description: "" }] }}>
        <AdFormImageSection showSaveStatus />
      </Wrapper>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("não terminou de enviar");
    expect(screen.queryByText("Foto salva na publicação pendente.")).not.toBeInTheDocument();
  });
});
