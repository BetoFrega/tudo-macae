// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { reportFailure } from "./uiFixtures";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import type { MediaOptionsResult } from "@tudomacae/media/options";
import {
  entrevista,
  fakeLibrary,
  openPicker,
  option,
  orla,
  prefeitura,
} from "./mediaPickerFixtures";

describe("MediaPicker browsing the acervo", () => {
  test("offers the media of the kind the context asked for, and no other kind", async () => {
    await openPicker(fakeLibrary([prefeitura, entrevista]));

    expect(await screen.findByRole("img", { name: prefeitura.alt })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: entrevista.alt })).not.toBeInTheDocument();
  });

  test("hands back the media chosen from the acervo and closes", async () => {
    const { onSelectAction } = await openPicker(fakeLibrary([prefeitura, orla]));

    await screen.findByRole("img", { name: orla.alt });
    await userEvent.click(option(orla.alt));

    expect(onSelectAction).toHaveBeenCalledWith(orla);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  test("loads the next bounded page without losing the first one", async () => {
    const library = fakeLibrary([]);
    library.loadAction
      .mockResolvedValueOnce({
        success: true,
        options: [prefeitura],
        nextCursor: "next-page",
      })
      .mockResolvedValueOnce({ success: true, options: [orla] });

    await openPicker(library);
    await screen.findByRole("img", { name: prefeitura.alt });
    await userEvent.click(screen.getByRole("button", { name: "Carregar mais mídias" }));

    expect(await screen.findByRole("img", { name: orla.alt })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: prefeitura.alt })).toBeInTheDocument();
    expect(library.loadAction).toHaveBeenNthCalledWith(
      2,
      "article-image",
      "next-page",
    );
  });

  test("says the acervo has nothing of this kind yet", async () => {
    await openPicker(fakeLibrary([entrevista]));

    expect(await screen.findByText("Nenhuma mídia desta espécie no acervo."))
      .toHaveAttribute("role", "status");
  });

  test("shows loading until the acervo answers", async () => {
    const library = fakeLibrary([prefeitura]);
    let answer: ((result: MediaOptionsResult) => void) | undefined;
    library.loadAction.mockReturnValueOnce(new Promise((resolve) => {
      answer = resolve;
    }));
    await openPicker(library);

    expect(await screen.findByText("Carregando o acervo..."))
      .toHaveAttribute("role", "status");
    const focusedWhileLoading = document.activeElement;

    answer?.({ success: true, options: [prefeitura] });
    expect(await screen.findByRole("img", { name: prefeitura.alt })).toBeInTheDocument();
    expect(screen.queryByText("Carregando o acervo...")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(focusedWhileLoading);
  });

  test("shows an expected refusal returned by the acervo", async () => {
    const library = fakeLibrary([prefeitura]);
    library.loadAction.mockResolvedValueOnce({
      success: false,
      error: "Você não tem permissão para gerenciar o acervo de mídia.",
    });

    await openPicker(library);

    expect(await screen.findByText("Você não tem permissão para gerenciar o acervo de mídia."))
      .toHaveAttribute("role", "alert");
    expect(screen.queryByText("Carregando o acervo...")).not.toBeInTheDocument();
  });

  test("hides technical text when the acervo call is rejected", async () => {
    const library = fakeLibrary([prefeitura]);
    const technicalMessage
      = "Minified React error #441: storage credential secret";
    library.loadAction.mockRejectedValueOnce(new Error(technicalMessage));
    window.history.replaceState({}, "", "/redacao/pautas/private-story-id?token=private");
    reportFailure.mockClear();

    await openPicker(library);

    expect(await screen.findByText("Não foi possível ler o acervo."))
      .toHaveAttribute("role", "alert");
    expect(screen.queryByText(technicalMessage)).not.toBeInTheDocument();
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith("media.picker.read.failed", "media.options.read");
  });
});
