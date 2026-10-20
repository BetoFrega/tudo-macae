// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "./uiFixtures";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MediaForm } from "@tudomacae/media/ui";
import type { CreateMediaResult } from "@tudomacae/media/form";

vi.mock("@tudomacae/media/imageProcessing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudomacae/media/imageProcessing")>();
  return { ...actual, processImage: vi.fn(async (file: File) => file) };
});

function imageFile(name = "praia.webp", type = "image/webp") {
  return new File(["image-bytes"], name, { type });
}

async function chooseFile(file = imageFile()) {
  fireEvent.change(screen.getByLabelText("Arquivo"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByLabelText("Arquivo")).toBeEnabled());
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillRequiredMetadata({ withAlt = true } = {}) {
  if (withAlt) fill("Texto alternativo", "Fachada da Prefeitura de Macaé");
  fill("Autoria", "Maria Souza");
  fill("Crédito", "Foto: Maria Souza/Tudo Macaé");
  fireEvent.change(screen.getByLabelText("Data de aquisição"), {
    target: { value: "2026-08-20T14:30" },
  });
}

describe("MediaForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders the canonical kind and structured provenance fields", () => {
    render(<MediaForm onSubmitAction={vi.fn()} />);

    expect(screen.getByLabelText("Espécie")).toHaveTextContent("Imagem de matéria");
    expect(screen.getByLabelText("Arquivo")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto alternativo")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto alternativo")).toHaveAccessibleDescription("Descrição visual para leitores de tela. Não é exibida como legenda. Não precisa informar o uso de IA generativa.");
    expect(screen.getByLabelText("Legenda")).toHaveAccessibleDescription("Contexto editorial junto da imagem. Opcional; não use alt, crédito ou aviso de geração por IA.");
    expect(screen.getByLabelText("Crédito")).toHaveAccessibleDescription("Atribuição confirmada, em tamanho menor dentro da imagem. Para conteúdo gerado, use Tudo Macaé AI.");
    expect(screen.getByLabelText("Origem")).toHaveTextContent("Produção própria");
    expect(screen.getByLabelText("Autoria")).toBeInTheDocument();
    expect(screen.getByLabelText("Crédito")).toBeInTheDocument();
    expect(screen.getByLabelText("Data de aquisição")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preparar novo envio" })).not.toBeInTheDocument();
  });

  test("offers reuse before a second upload and sends the selected canonical identity", async () => {
    const onSubmitAction = vi.fn()
      .mockResolvedValueOnce({ success: false, error: "Mídia encontrada no acervo.", matches: [{ id: "canonical-1", alt: "Fachada já cadastrada" }] })
      .mockResolvedValueOnce({ success: true, mediaId: "canonical-1" });
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    await userEvent.click(await screen.findByRole("button", { name: "Usar Fachada já cadastrada" }));
    await waitFor(() => expect(screen.getByLabelText("Autoria")).toHaveValue(""));
    const selection: FormData = onSubmitAction.mock.calls[1][0];
    expect(selection.get("existingMediaId")).toBe("canonical-1");
    expect(selection.get("file")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Usar\b/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Mídia encontrada no acervo.")).not.toBeInTheDocument();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByText("Escolha o arquivo da mídia.")).toBeInTheDocument();
  });

  test("keeps metadata and candidates when selecting existing Media is refused", async () => {
    const onSubmitAction = async (form: FormData): Promise<CreateMediaResult> => form.has("existingMediaId")
      ? { success: false, error: "A Mídia escolhida não está disponível." }
      : { success: false, error: "Mídia encontrada.", matches: [{ id: "canonical-1", alt: "Fachada" }] };
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    await userEvent.click(await screen.findByRole("button", { name: "Usar Fachada" }));
    expect(await screen.findByText("A Mídia escolhida não está disponível.")).toBeInTheDocument();
    expect(screen.getByLabelText("Autoria")).toHaveValue("Maria Souza");
    expect(screen.getByRole("button", { name: "Usar Fachada" })).toBeInTheDocument();
  });

  test("requires confirmation for new upload and resets it when the file changes", async () => {
    const onSubmitAction = async (form: FormData): Promise<CreateMediaResult> => form.get("confirmNew") === "true"
      ? { success: false, error: "Novo envio confirmado." }
      : { success: false, error: "Mídia encontrada.", matches: [{ id: "canonical-1", alt: "Fachada" }] };
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    await userEvent.click(await screen.findByRole("button", { name: "Preparar novo envio" }));
    expect(screen.queryByText("Mídia encontrada.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Usar\b/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByText("Novo envio confirmado.")).toBeInTheDocument();
    await chooseFile(imageFile("outra.webp"));
    expect(screen.queryByText("Novo envio confirmado.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByRole("button", { name: "Usar Fachada" })).toBeInTheDocument();
    await chooseFile(imageFile("terceira.webp"));
    expect(screen.queryByRole("button", { name: /^Usar\b/ })).not.toBeInTheDocument();
  });

  test("successful confirmed submission clears metadata, file and confirmation", async () => {
    const confirmations: FormDataEntryValue[] = [];
    const onSubmitAction = async (form: FormData): Promise<CreateMediaResult> => {
      confirmations.push(form.get("confirmNew") ?? "absent");
      return form.get("confirmNew") === "true"
        ? { success: true, mediaId: "new-media" }
        : { success: false, error: "Mídia encontrada.", matches: [{ id: "canonical-1", alt: "Fachada" }] };
    };
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    await userEvent.click(await screen.findByRole("button", { name: "Preparar novo envio" }));
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    await waitFor(() => expect(screen.getByLabelText("Texto alternativo")).toHaveValue(""));
    expect(screen.getByLabelText("Espécie")).toHaveTextContent("Imagem de matéria");
    expect(screen.queryByRole("button", { name: /^Usar\b/ })).not.toBeInTheDocument();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByText("Escolha o arquivo da mídia.")).toBeInTheDocument();
    await chooseFile(imageFile("outra.webp"));
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByText("Mídia encontrada.")).toBeInTheDocument();
    expect(confirmations).toEqual(["absent", "true", "absent"]);
  });

  test("disables another submission and file replacement while saving", async () => {
    const pending = Promise.withResolvers<CreateMediaResult>();
    render(<MediaForm onSubmitAction={() => pending.promise} />);
    await chooseFile();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByRole("button", { name: "Cadastrando..." })).toBeDisabled();
    expect(screen.getByLabelText("Arquivo")).toBeDisabled();
    pending.resolve({ success: true, mediaId: "new-media" });
    expect(await screen.findByRole("button", { name: "Cadastrar mídia" })).toBeEnabled();
  });

  test("refuses to submit without alt before calling the action", async () => {
    const onSubmitAction = vi.fn();
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata({ withAlt: false });

    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));

    expect(await screen.findByText("Informe o texto alternativo da imagem."))
      .toBeInTheDocument();
    expect(onSubmitAction).not.toHaveBeenCalled();
  });

  test("refuses incomplete structured provenance before calling the action", async () => {
    const onSubmitAction = vi.fn();
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fill("Texto alternativo", "Fachada da Prefeitura de Macaé");

    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));

    expect(await screen.findByText("Informe a autoria da mídia."))
      .toBeInTheDocument();
    expect(onSubmitAction).not.toHaveBeenCalled();
  });

  test("refuses a file type outside the accepted list", async () => {
    render(<MediaForm onSubmitAction={vi.fn()} />);
    await chooseFile(imageFile("planilha.pdf", "application/pdf"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Tipo de arquivo inválido. Use JPEG, PNG, WebP ou GIF.",
    );
    const fileInput = screen.getByLabelText("Arquivo");
    expect(fileInput).toHaveAttribute("aria-invalid", "true");
    expect(fileInput).toHaveAttribute("aria-describedby", alert.id);

    await chooseFile();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fileInput).not.toHaveAttribute("aria-invalid", "true");
    expect(fileInput).not.toHaveAttribute("aria-describedby");
  });

  test("refuses to submit without a file", async () => {
    const onSubmitAction = vi.fn();
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    expect(await screen.findByText("Escolha o arquivo da mídia."))
      .toBeInTheDocument();
    expect(onSubmitAction).not.toHaveBeenCalled();
  });

  test("sends the processed file with explicit origin, basis and acquisition time", async () => {
    const onSubmitAction = vi.fn().mockResolvedValue({
      success: true,
      mediaId: "media-1",
    });
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata();
    fill("Legenda", "Sede da Prefeitura");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    await waitFor(() => expect(onSubmitAction).toHaveBeenCalled());

    const sent = onSubmitAction.mock.calls[0][0] as FormData;
    expect(sent.get("kind")).toBe("article-image");
    expect(sent.get("origin")).toBe("own-production");
    expect(sent.get("displayBasis")).toBe("own-production");
    expect(sent.get("creator")).toBe("Maria Souza");
    expect(sent.get("credit")).toBe("Foto: Maria Souza/Tudo Macaé");
    expect(sent.get("acquiredAt")).toBe("2026-08-20T14:30");
    expect(sent.get("file")).toBeInstanceOf(File);
  });

  test("surfaces the refusal the server sends back", async () => {
    const onSubmitAction = vi.fn().mockResolvedValue({
      success: false,
      error: "Você não tem permissão para gerenciar o acervo de mídia.",
    });
    render(<MediaForm onSubmitAction={onSubmitAction} />);
    await chooseFile();
    fillRequiredMetadata();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar mídia" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Você não tem permissão para gerenciar o acervo de mídia.");
    const fileInput = screen.getByLabelText("Arquivo");
    expect(fileInput).toHaveAttribute("aria-invalid", "true");
    expect(fileInput).toHaveAttribute("aria-describedby", alert.id);

    await chooseFile(imageFile("recuperada.webp"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fileInput).not.toHaveAttribute("aria-invalid", "true");
  });
});
