import { expect, test, vi } from "vitest";
import { BlogError } from "../blog";
import { BlogInputError, createEditorialBlogClient } from "../client";

const origin = "https://api.tudomacae.test/";
const publicOrigin = "https://tudomacae.test";

function client(respond: (request: Request) => Response | Promise<Response>) {
  const request = vi.fn<typeof fetch>(async (url, init) => respond(new Request(url, init)));
  return { request, blog: createEditorialBlogClient({ origin, publicOrigin, request }) };
}
const failure = (status: number, message: string, blog?: object) => Response.json({ error: { message, data: { code: "X", ...(blog ? { blog } : {}) } } }, { status });

test("reads travel as a query with the session, writes as a POST from the app origin with the correlation id", async () => {
  const post = { id: "post", status: "draft", revision: 2, content: { title: "T", body: "B", path: "/noticia/t", sources: [], media: [] }, mediaIds: [], createdAt: 1, updatedAt: 2 };
  const { request, blog } = client(request => Response.json({ result: { data: request.method === "GET" ? { items: [] } : { post, synchronization: "unconfirmed" } } }));
  expect(await blog.list(undefined, "token")).toEqual({ items: [] });
  await blog.takeOffline({ id: "post", expectedRevision: 1 }, "token", "correlation");
  const [read, write] = request.mock.calls.map(([url, init]) => new Request(url, init));
  expect(new URL(read!.url).searchParams.get("input")).toBe(JSON.stringify({ operation: "list", input: null }));
  expect(read!.headers.get("cookie")).toBe("session=token");
  expect([write!.method, write!.headers.get("origin"), await write!.json()]).toEqual(["POST", publicOrigin, { operation: "takeOffline", input: { id: "post", expectedRevision: 1 }, correlationId: "correlation" }]);
});

test("serialized refusals become the errors the panel already shows", async () => {
  const conflict = client(() => failure(409, "O post foi alterado.", { name: "BlogError", code: "conflict" })).blog.read("post", "token");
  await expect(conflict).rejects.toBeInstanceOf(BlogError);
  await expect(conflict).rejects.toMatchObject({ code: "conflict", message: "O post foi alterado." });
  const invalid = client(() => failure(400, "Informe o título.", { name: "ValidationError", field: "title" })).blog.read("post", "token");
  await expect(invalid).rejects.toBeInstanceOf(BlogInputError);
  await expect(invalid).rejects.toMatchObject({ field: "title" });
  await expect(client(() => failure(403, "Forbidden")).blog.read("post", "token")).rejects.toMatchObject({ code: "unavailable" });
  const refused = client(() => Response.json({ error: { message: "FORBIDDEN", data: { code: "FORBIDDEN" } } }, { status: 403 })).blog.read("post", "token");
  await expect(refused).rejects.toBeInstanceOf(BlogError);
  await expect(refused).rejects.toMatchObject({ code: "forbidden" });
});

test("a Worker that cannot answer, or answers outside the protocol, is never a domain decision", async () => {
  await expect(client(() => Promise.reject(new TypeError("offline"))).blog.read("post", "token")).rejects.toMatchObject({ code: "unavailable" });
  await expect(client(() => failure(500, "Falha")).blog.read("post", "token")).rejects.toMatchObject({ code: "unavailable", reportedByWorker: false });
  // The Worker marks a 5xx it logged; a gateway 5xx carries no mark.
  const logged = new Response(JSON.stringify({ error: { message: "Falha", data: { code: "INTERNAL_SERVER_ERROR" } } }), { status: 500, headers: { "x-blog-error-reported": "1" } });
  await expect(client(() => logged).blog.read("post", "token")).rejects.toMatchObject({ reportedByWorker: true });
  await expect(client(() => failure(400, "Falha", { name: "BlogError" })).blog.read("post", "token")).rejects.toMatchObject({ code: "incompatible" });
  await expect(client(() => Response.json({ data: null })).blog.read("post", "token")).rejects.toMatchObject({ code: "incompatible" });
  // A well-formed wrapper around the wrong shape is as incompatible as no wrapper.
  await expect(client(() => Response.json({ result: { data: null } })).blog.list(undefined, "token")).rejects.toMatchObject({ code: "incompatible" });
  await expect(client(() => Response.json({ result: { data: { post: { id: "post" }, synchronization: "confirmed" } } })).blog.save({ title: "T", body: "B" }, "token")).rejects.toMatchObject({ code: "incompatible" });
  await expect(client(() => new Response(null, { status: 403 })).blog.read("post", "token")).rejects.toMatchObject({ code: "unavailable" });
  // An optional field of the wrong type is skew too, never a post the panel can trust.
  const post = { id: "post", status: "draft", revision: 2, content: { title: "T", body: "B", path: "/noticia/t", sources: [], media: [] }, mediaIds: [], createdAt: 1, updatedAt: 2 };
  expect(await client(() => Response.json({ result: { data: post } })).blog.read("post", "token")).toEqual(post);
  await expect(client(() => Response.json({ result: { data: { ...post, scheduled: "false" } } })).blog.read("post", "token")).rejects.toMatchObject({ code: "incompatible" });
  await expect(client(() => Response.json({ result: { data: { ...post, content: { ...post.content, leadMediaId: 42 } } } })).blog.read("post", "token")).rejects.toMatchObject({ code: "incompatible" });
  expect(() => createEditorialBlogClient({ origin: "http://api.tudomacae.test", publicOrigin })).toThrow(TypeError);
});
