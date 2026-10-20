import { expect, test, vi } from "vitest";
import { createPublicBlogClient, PublicBlogRequestError } from "../publicClient";

function client(data: unknown) {
  const request = vi.fn<typeof fetch>(async () => Response.json({ result: { data } }));
  return createPublicBlogClient({ origin: "https://api.tudomacae.test/", publicOrigin: "https://www.tudomacae.test", request });
}
const content = { title: "Praia", body: "Texto.", path: "/noticia/post/praia", sources: [], media: [] };

test("a complete Worker answer is returned as the Blog reads it", async () => {
  expect(await client({ kind: "published", content, publishedAt: 1 }).article("post")).toEqual({ kind: "published", content, publishedAt: 1 });
  expect(await client({ items: [{ id: "post", title: "Praia", slug: "praia" }] }).page()).toEqual({ items: [{ id: "post", title: "Praia", slug: "praia" }] });
});

test.each([
  ["a published edition without its content", { kind: "published", content: {}, publishedAt: 1 }],
  ["a legacy article without its fields", { kind: "legacy", article: { id: "post" }, media: [], story: null, sources: [], editorName: null }],
  ["an unknown kind", { kind: "draft" }],
])("%s is incompatible, never rendered", async (_label, data) => {
  await expect(client(data).article("post")).rejects.toMatchObject({ code: "incompatible" });
});

test("a page item whose lead Media lacks its credit is incompatible", async () => {
  await expect(client({ items: [{ id: "post", title: "Praia", slug: "praia", lead: { id: "photo", alt: "", caption: "" } }] }).page()).rejects.toMatchObject({ code: "incompatible" });
});

test("an ID or cursor outside the article shape answers as the module does, without a refused request", async () => {
  const request = vi.fn<typeof fetch>(async () => Response.json({ result: { data: { items: [] } } }));
  const reader = createPublicBlogClient({ origin: "https://api.tudomacae.test/", publicOrigin: "https://www.tudomacae.test", request });
  expect(await reader.article("a".repeat(129))).toEqual({ kind: "unavailable" });
  expect(request).not.toHaveBeenCalled();
  await reader.page("b".repeat(129));
  expect(new URL(String(request.mock.calls[0]![0])).searchParams.get("input")).toBe(JSON.stringify({ operation: "page", input: {} }));
});

const digest = "a".repeat(64);
const requestId = "01234567-89ab-4def-8123-456789abcdef";
function imageClient(answer: () => Promise<Response>) {
  const request = vi.fn<typeof fetch>(answer);
  return { request, client: createPublicBlogClient({ origin: "https://api.tudomacae.test/", publicOrigin: "https://www.tudomacae.test", request }) };
}

test("image bytes come from the Worker's public routes with the request id and no credential", async () => {
  const { client: reader, request } = imageClient(async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/webp" } }));
  expect(await reader.editorialImage("photo", digest, requestId)).toEqual({ bytes: new Uint8Array([1, 2]), mimeType: "image/webp" });
  expect(await reader.articleMedia("post", "photo", requestId)).toEqual({ bytes: new Uint8Array([1, 2]), mimeType: "image/webp" });
  expect(request.mock.calls.map(([url, init]) => [String(url), init?.headers])).toEqual([
    [`https://api.tudomacae.test/api/imagens/editorial/photo/${digest}`, { "x-request-id": requestId }],
    ["https://api.tudomacae.test/api/noticia/post/midias/photo", { "x-request-id": requestId }],
  ]);
});

test("an identifier outside the route shape is not public and reaches no Worker", async () => {
  const { client: reader, request } = imageClient(async () => new Response(null));
  expect(await reader.editorialImage("../photo", digest)).toBeNull();
  expect(await reader.editorialImage("photo", "A".repeat(64))).toBeNull();
  expect(await reader.articleMedia("post", "photo/../x")).toBeNull();
  expect(await reader.articleMedia("post", " photo")).toBeNull();
  expect(await reader.articleMedia("post", "x".repeat(201))).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

test("a Media ID with dots, accents or spaces travels percent-encoded within the Media contract", async () => {
  const { client: reader, request } = imageClient(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } }));
  await reader.articleMedia("post", "foto capa.ç");
  await reader.articleMedia("post", "x".repeat(200));
  await reader.articleMedia("post", "图".repeat(200));
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.tudomacae.test/api/noticia/post/midias/foto%20capa.%C3%A7",
    `https://api.tudomacae.test/api/noticia/post/midias/${"x".repeat(200)}`,
    `https://api.tudomacae.test/api/noticia/post/midias/${"%E5%9B%BE".repeat(200)}`,
  ]);
});

test.each([
  ["a 404", async () => new Response(null, { status: 404 }), null],
  ["a failed Worker", async () => new Response(null, { status: 502 }), new PublicBlogRequestError("unavailable", 502)],
  ["an unreachable Worker", async () => Promise.reject(new TypeError("network")), new PublicBlogRequestError("unavailable")],
  ["a body that is no image", async () => Response.json({}), new PublicBlogRequestError("incompatible", 200)],
] as const)("%s decides the read", async (_label, answer, expected) => {
  const { client: reader } = imageClient(answer);
  const read = reader.editorialImage("photo", digest);
  if (expected) await expect(read).rejects.toMatchObject({ code: expected.code });
  else expect(await read).toBeNull();
});

test("a 5xx the Worker marked as logged carries that mark, so the app does not log it again", async () => {
  const marked = imageClient(async () => new Response(null, { status: 502, headers: { "x-blog-public-error-reported": "1" } })).client;
  await expect(marked.editorialImage("photo", digest)).rejects.toMatchObject({ code: "unavailable", reportedByWorker: true });
  const unmarked = imageClient(async () => new Response(null, { status: 502 })).client;
  await expect(unmarked.editorialImage("photo", digest)).rejects.toMatchObject({ reportedByWorker: false });
});

test("a HEAD image check asks the Worker for no body", async () => {
  const { client: reader, request } = imageClient(async () => new Response(null, { headers: { "content-type": "image/webp" } }));
  expect(await reader.editorialImage("photo", digest, requestId, "HEAD")).toEqual({ bytes: new Uint8Array(), mimeType: "image/webp" });
  expect(request.mock.calls[0]![1]?.method).toBe("HEAD");
});
