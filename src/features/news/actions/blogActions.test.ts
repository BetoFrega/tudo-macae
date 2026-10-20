import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), offline: vi.fn(), worker: vi.fn(), forbidden: vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
}) }));
vi.mock("@/features/authentication/actions/getCurrentUser", () => ({ getCurrentUser: async () => ({ uid: "operator", isAdmin: true }) }));
vi.mock("@/packages/news-cache", () => ({ revalidateArticle: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ forbidden: mocks.forbidden, unauthorized: vi.fn() }));
vi.mock("@/packages/blog-api", () => ({ workerBlog: mocks.worker }));
import { BlogError } from "@tudomacae/editorial-blog/blog";
import { BlogInputError, BlogRequestError } from "@tudomacae/editorial-blog/client";
import { listBlogPosts, readBlogPost, saveBlogPost, takeBlogPostOffline } from "./blogActions";

beforeEach(() => {
  mocks.worker.mockResolvedValue({ save: mocks.save, takeOffline: mocks.offline });
});
afterEach(() => {
  vi.restoreAllMocks();
});
test("unexpected mutation failure reports uncertainty and records safe operation context without content", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.save.mockRejectedValue(new Error("private content or provider message"));
  const result = await saveBlogPost({ title: "Private title", body: "Private body" });
  expect(result).toMatchObject({ success: false, error: expect.stringMatching(/Reabra/u) });
  expect(output).toHaveBeenCalledOnce();
  const record = JSON.parse(output.mock.calls[0][0]);
  expect(record).toMatchObject({ event: "blog.mutation", service: "nextjs", outcome: "error", operation: "save", route: "server-action:saveBlogPost", correlationId: expect.any(String) });
  expect(JSON.stringify(record)).not.toMatch(/Private title|Private body|private content|provider message/u);
});

test("validation identifies the affected field without starting a mutation", async () => {
  mocks.save.mockClear();
  await expect(saveBlogPost({ title: "", body: "Texto" })).resolves.toMatchObject({ success: false, field: "title", error: "Informe o título." });
  expect(mocks.save).not.toHaveBeenCalled();
});

test.each(["body", "leadMediaId"] as const)("preserves the failing media field %s", async (field) => {
  mocks.save.mockRejectedValue(new BlogError("media", "Imagem indisponível.", field));
  await expect(saveBlogPost({ title: "Post", body: "Texto" })).resolves.toMatchObject({ success: false, field });
});

const post = { id: "post", status: "draft", revision: 1, content: { title: "Post", body: "Texto", path: "/noticias/post", sources: [], media: [] }, createdAt: 1, updatedAt: 1, mediaIds: [] };

test("the Worker answers under the mutation's correlation", async () => {
  mocks.save.mockResolvedValue({ post, synchronization: "confirmed" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  await expect(saveBlogPost({ title: "Post", body: "Texto" })).resolves.toMatchObject({ success: true, post: { id: "post" } });
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ title: "Post" }), expect.any(String));
});

test("a Worker validation refusal names the field the editor corrects", async () => {
  mocks.worker.mockResolvedValue({ save: vi.fn().mockRejectedValue(new BlogInputError("Informe o corpo.", "body")) });
  await expect(saveBlogPost({ title: "Post", body: "Texto" })).resolves.toEqual({ success: false, error: "Informe o corpo.", field: "body" });
});

test.each([
  ["a failure the Worker already logged", new BlogRequestError("unavailable", true), 0],
  ["a request the Worker never answered", new BlogRequestError("unavailable"), 1],
] as const)("%s is reported once across the boundary", async (_, failure, records) => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.worker.mockResolvedValue({ takeOffline: vi.fn().mockRejectedValue(failure) });
  await expect(takeBlogPostOffline({ id: "post", expectedRevision: 1 })).resolves.toMatchObject({ success: false, error: expect.stringMatching(/Reabra/u) });
  expect(output).toHaveBeenCalledTimes(records);
  if (records) expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "takeOffline", failureCategory: "unavailable" });
});

test("the Worker's role refusal on a read is the page's refusal, not a failure", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.worker.mockResolvedValue({ list: vi.fn().mockRejectedValue(new BlogError("forbidden", "Acesso restrito a Administradores e Editores ativos.")) });
  await expect(listBlogPosts()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;403");
  expect(mocks.forbidden).toHaveBeenCalled();
  expect(output).not.toHaveBeenCalled();
});

test("a Blog that cannot be built sends no write and lets the editor retry", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.worker.mockRejectedValue(new Error("Blog configuration missing"));
  await expect(saveBlogPost({ title: "Post", body: "Texto" })).resolves.toMatchObject({ success: false, retryable: true, error: expect.stringMatching(/Nada foi gravado/u) });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ operation: "save", stage: "configuration", failureCategory: "unknown" });
});

test("an edit-page read failure is attributed to the edit route", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.worker.mockResolvedValue({ read: vi.fn().mockRejectedValue(new BlogRequestError("unavailable")) });
  await expect(readBlogPost("post")).rejects.toBeInstanceOf(BlogRequestError);
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ event: "blog.read", operation: "get", route: "server-component:/redacao/materias/[id]", failureCategory: "unavailable" });
});
