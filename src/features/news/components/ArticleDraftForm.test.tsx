// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), takeOffline: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/integrations/media/MediaComponents", () => ({ MediaPicker: () => null }));
vi.mock("@/features/media/createMedia", () => ({ createMedia: vi.fn() }));
vi.mock("@/features/media/actions/getMediaOptions", () => ({ getMediaOptionById: vi.fn(), getMediaOptions: vi.fn() }));
vi.mock("../actions/blogActions", () => ({ saveBlogPost: mocks.save, takeBlogPostOffline: mocks.takeOffline }));
import { ArticleDraftForm } from "./ArticleDraftForm";
import type { BlogPost } from "@tudomacae/editorial-blog/blog";

function storedPost(status: BlogPost["status"]): BlogPost {
  return { id: "post-1", status, revision: 1, mediaIds: [], createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    ...(status === "published" ? { publishedAt: 1_700_000_000_000 } : {}),
    content: { title: "Registro", body: "Texto", path: "/noticia/post-1/registro", sources: [], media: [] } };
}

test.each(["response", "transport"])("an uncertain creation blocks retry and keeps the durable list reachable (%s)", async (failure) => {
  mocks.save.mockReset();
  if (failure === "transport") mocks.save.mockRejectedValue(new Error("Response lost"));
  else mocks.save.mockResolvedValue({ success: false, error: "Operação não confirmada. Reabra a lista de posts para conferir o estado antes de tentar novamente.", field: undefined });
  const user = userEvent.setup();
  render(<ArticleDraftForm initialPost={null} />);
  await user.type(screen.getByLabelText("Título"), "Registro");
  await user.type(screen.getByLabelText("Texto"), "Texto");
  const save = screen.getByRole("button", { name: "Salvar rascunho" });
  await user.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent(/Reabra/u);
  expect(save).toBeDisabled();
  expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Voltar aos posts" })).toHaveAttribute("href", "/redacao/materias");
  await user.click(save);
  expect(mocks.save).toHaveBeenCalledOnce();
});

test("a failure before any write keeps the form and its text for a retry", async () => {
  mocks.save.mockReset();
  mocks.save.mockResolvedValue({ success: false, error: "Não foi possível acessar o Blog. Nada foi gravado; tente novamente.", field: undefined, retryable: true });
  const user = userEvent.setup();
  render(<ArticleDraftForm initialPost={null} />);
  await user.type(screen.getByLabelText("Título"), "Registro");
  await user.type(screen.getByLabelText("Texto"), "Texto");
  const save = screen.getByRole("button", { name: "Salvar rascunho" });
  await user.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent(/Nada foi gravado/u);
  // The error renders after the action resolves, which can be one commit before the transition stops pending.
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.getByLabelText("Texto")).toHaveValue("Texto");
  await user.click(save);
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

test.each([
  ["confirmed", "Post publicado."],
  ["unconfirmed", "Post salvo. A atualização da listagem ou do cache de imagens não foi confirmada."],
] as const)("publishing reports the %s distribution", async (synchronization, message) => {
  mocks.save.mockReset();
  mocks.save.mockResolvedValue({ success: true, post: storedPost("published"), synchronization });
  const user = userEvent.setup();
  render(<ArticleDraftForm initialPost={storedPost("draft")} />);
  await user.click(screen.getByRole("button", { name: "Publicar" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(message));
});

test.each([
  ["confirmed", "Post retirado do ar. Conteúdo preservado."],
  ["unconfirmed", "Post retirado do ar. A atualização da listagem ou do cache de imagens não foi confirmada."],
] as const)("taking a post offline reports the %s distribution", async (synchronization, message) => {
  mocks.takeOffline.mockReset();
  mocks.takeOffline.mockResolvedValue({ success: true, post: storedPost("draft"), synchronization });
  const user = userEvent.setup();
  render(<ArticleDraftForm initialPost={storedPost("published")} />);
  await user.click(screen.getByRole("button", { name: "Retirar do ar" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(message));
  expect(mocks.takeOffline).toHaveBeenCalledWith({ id: "post-1", expectedRevision: 1 });
});
