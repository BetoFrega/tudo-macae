import { expect, test, vi } from "vitest";
import z from "zod";
import type { Miniflare } from "miniflare";
import { BlogError } from "@tudomacae/editorial-blog/blog";
import { BlogInputError, BlogRequestError, createEditorialBlogClient } from "@tudomacae/editorial-blog/client";
import { authenticationDatabase, editorialDatabase, start } from "./authenticationRuntimeHarness";

const origin = "http://authentication.test";

async function account(worker: Miniflare, email: string, claims: Record<string, boolean>) {
  const created = await worker.dispatchFetch(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password: "abc123" }) });
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json()).user.id;
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify(claims), uid).run();
  return decodeURIComponent(created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!.slice("session=".length));
}

/** The production client, reaching the Worker through Miniflare instead of the network. */
const client = (worker: Miniflare) => createEditorialBlogClient({ origin, publicOrigin: origin, allowLocal: true,
  request: (async (url: URL, init: RequestInit) => worker.dispatchFetch(url.href, init as never)) as unknown as typeof fetch });
const openAuthority = async () => (await editorialDatabase()).prepare("UPDATE editorial_authority SET authority='worker' WHERE id=1").run();

test("Blog procedures stay closed until the editorial authority belongs to the Worker and refuse non-editors", async () => {
  const worker = await start();
  const blog = client(worker);
  const editor = await account(worker, "blog-closed@example.com", { editor: true });
  await expect(blog.list(undefined, editor)).rejects.toBeInstanceOf(BlogRequestError);
  await openAuthority();
  expect(await blog.list(undefined, editor)).toEqual({ items: [] });
  const visitor = await account(worker, "blog-visitor@example.com", {});
  await expect(blog.list(undefined, visitor)).rejects.toMatchObject({ code: "forbidden" });
  await expect(blog.list(undefined, undefined)).rejects.toBeInstanceOf(BlogError);
});

test("an editor saves, publishes and takes a post offline; refusals keep the message and field the panel shows", async () => {
  const worker = await start();
  await openAuthority();
  const blog = client(worker);
  const editor = await account(worker, "blog-editor@example.com", { editor: true });
  // The longest accepted body, escaped by JSON well beyond the default request limit.
  const body = "\"".repeat(200_000);
  const draft = await blog.save({ title: "Orla", body }, editor, "save-correlation");
  // The harness binds no public index, so distribution stays unconfirmed while the save commits.
  expect(draft).toMatchObject({ post: { status: "draft", revision: 1 }, synchronization: "unconfirmed" });
  expect((await blog.read(draft.post.id, editor))?.revision).toBe(1);
  const published = await blog.save({ id: draft.post.id, expectedRevision: 1, title: "Orla", body: "Texto", publish: true }, editor);
  expect(published.post).toMatchObject({ status: "published", revision: 2 });
  expect((await blog.list(undefined, editor)).items).toEqual([expect.objectContaining({ id: draft.post.id, status: "published" })]);

  const stale = blog.save({ id: draft.post.id, expectedRevision: 1, title: "Orla", body: "Texto" }, editor);
  await expect(stale).rejects.toBeInstanceOf(BlogError);
  await expect(stale).rejects.toMatchObject({ code: "conflict", message: "O post foi alterado. Reabra a página antes de salvar." });
  const missing = blog.save({ title: "Orla", body: "![Foto](media:ausente)" }, editor);
  await expect(missing).rejects.toMatchObject({ code: "media", field: "body" });
  const invalid = blog.save({ title: " ", body: "Texto" }, editor);
  await expect(invalid).rejects.toBeInstanceOf(BlogInputError);
  await expect(invalid).rejects.toMatchObject({ message: "Informe o título.", field: "title" });

  const offline = await blog.takeOffline({ id: draft.post.id, expectedRevision: 2 }, editor);
  expect(offline.post).toMatchObject({ status: "draft", revision: 3 });
  expect((await blog.read(draft.post.id, editor))?.status).toBe("draft");
});

test("an unexpected Blog failure is a Blog signal naming its operation, outside authentication diagnostics", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start();
  await openAuthority();
  const blog = client(worker);
  const editor = await account(worker, "blog-failing@example.com", { editor: true });
  // A malformed row stands in for incompatible persisted data; no Blog operation writes one.
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('article','corrupt','{\"blog\":true,\"status\":42}','fixture')").run();
  await expect(blog.read("corrupt", editor)).rejects.toMatchObject({ code: "unavailable", reportedByWorker: true });
  await expect(blog.takeOffline({ id: "corrupt", expectedRevision: 0 }, editor, "mutation-correlation")).rejects.toBeInstanceOf(BlogRequestError);
  const events = messages.filter(message => message.includes("\"event\":\"blog.request.unavailable\"")).map(message => JSON.parse(message) as { route: string; operation?: string; correlationId: string });
  expect(events.map(event => [event.route, event.operation])).toEqual([["/api/trpc/blogRead", "get"], ["/api/trpc/blogWrite", "takeOffline"]]);
  // A failed mutation is found under the correlation the caller logged.
  expect(events[1]!.correlationId).toBe("mutation-correlation");
  expect(messages.filter(message => message.includes("authentication.worker.failed"))).toEqual([]);
});
