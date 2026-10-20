// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { reportFailure } from "./uiFixtures";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { MediaOption } from "@tudomacae/media/options";
import {
  articleImage,
  fakeLibrary,
  fillNewMediaForm,
  openPicker,
  orla,
  prefeitura,
  renderPicker,
} from "./mediaPickerFixtures";

// jsdom cannot encode an image, so only the canvas work is stubbed. The real
// `validateImageFile` runs, so what the picker refuses is what the acervo
// refuses.
vi.mock("@tudomacae/media/imageProcessing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudomacae/media/imageProcessing")>();
  return { ...actual, processImage: vi.fn(async (file: File) => file) };
});

describe("MediaPicker registering a new media", () => {
  test("registers a new media without leaving the picker and hands it back", async () => {
    const library = fakeLibrary([prefeitura]);
    const { onSelectAction } = await openPicker(library);

    await screen.findByRole("img", { name: prefeitura.alt });

    await fillNewMediaForm();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar e escolher" }));

    await waitFor(() => expect(onSelectAction).toHaveBeenCalled());

    const chosen = onSelectAction.mock.calls[0][0] as MediaOption;
    expect(chosen.alt).toBe(orla.alt);
    expect(chosen.provenance).toEqual(orla.provenance);

    // The context decides the kind — the picker never asks the person for it.
    const sent = library.createAction.mock.calls[0][0] as FormData;
    expect(sent.get("kind")).toBe("article-image");
    expect(screen.queryByLabelText("Espécie")).not.toBeInTheDocument();
  });

  test("keeps the picker open when registering the media is refused", async () => {
    const library = fakeLibrary([prefeitura]);
    library.createAction.mockResolvedValueOnce({
      success: false,
      error: "Não foi possível cadastrar a mídia.",
    });
    const { onSelectAction } = await openPicker(library);
    await screen.findByRole("img", { name: prefeitura.alt });
    await fillNewMediaForm();

    await userEvent.click(screen.getByRole("button", { name: "Cadastrar e escolher" }));

    expect(
      await screen.findByText("Não foi possível cadastrar a mídia."),
    ).toBeInTheDocument();
    expect(onSelectAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(library.loadAction).toHaveBeenCalledTimes(1);
  });

  test("shows a safe error when reloading after registration fails", async () => {
    const library = fakeLibrary([prefeitura]);
    library.loadAction.mockResolvedValueOnce({
      success: true,
      options: [prefeitura],
    }).mockResolvedValueOnce({
      success: false,
      error: "Não foi possível ler o acervo.",
    });
    const { onSelectAction } = await openPicker(library);
    await screen.findByRole("img", { name: prefeitura.alt });
    await fillNewMediaForm();

    await userEvent.click(screen.getByRole("button", { name: "Cadastrar e escolher" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("A mídia foi cadastrada, mas não foi possível carregá-la para seleção. Tente escolher novamente no acervo.");
    expect(screen.queryByText("Não foi possível ler o acervo.")).not.toBeInTheDocument();
    expect(onSelectAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("resolves a deduplicated canonical media outside the first page", async () => {
    const library = fakeLibrary([prefeitura]);
    library.loadAction.mockResolvedValueOnce({
      success: true,
      options: [prefeitura],
    }).mockResolvedValueOnce({
      success: true,
      options: [prefeitura],
    });
    const canonical = articleImage({ id: "media-old-canonical", alt: "Mídia já cadastrada" });
    library.createAction.mockResolvedValueOnce({ success: true, mediaId: canonical.id });
    const { onSelectAction } = renderPicker(library, async id => id === canonical.id ? canonical : null);
    await userEvent.click(screen.getByRole("button", { name: "Escolher mídia" }));
    await screen.findByRole("img", { name: prefeitura.alt });
    await fillNewMediaForm();

    await userEvent.click(screen.getByRole("button", { name: "Cadastrar e escolher" }));

    await waitFor(() => expect(library.loadAction).toHaveBeenCalledTimes(2));
    expect(onSelectAction).toHaveBeenCalledWith(canonical);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("announces a canonical resolution failure and keeps focus in the picker", async () => {
    const library = fakeLibrary([prefeitura]);
    library.loadAction.mockResolvedValueOnce({
      success: true,
      options: [prefeitura],
    }).mockResolvedValueOnce({
      success: false,
      error: "Não foi possível ler o acervo.",
    });
    library.createAction.mockResolvedValueOnce({ success: true, mediaId: "media-new" });
    const technicalMessage = "storage credential detail";
    reportFailure.mockClear();
    const { onSelectAction } = renderPicker(library, async () => {
      throw new Error(technicalMessage);
    });
    await userEvent.click(screen.getByRole("button", { name: "Escolher mídia" }));
    await screen.findByRole("img", { name: prefeitura.alt });
    await fillNewMediaForm();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar e escolher" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("A mídia foi cadastrada, mas não foi possível carregá-la para seleção.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cadastrar e escolher" }));
    expect(onSelectAction).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith("media.picker.resolve.failed", "media.options.resolve");
  });

  test("refuses a file the acervo would refuse, with the same message", async () => {
    await openPicker(fakeLibrary([prefeitura]));

    await screen.findByRole("img", { name: prefeitura.alt });
    fireEvent.change(screen.getByLabelText("Arquivo"), {
      target: {
        files: [new File(["bytes"], "planilha.pdf", { type: "application/pdf" })],
      },
    });

    expect(
      await screen.findByText("Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF."),
    ).toBeInTheDocument();
  });
});
