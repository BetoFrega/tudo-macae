import { expect, test, vi } from "vitest";
import z from "zod";
import type { Miniflare } from "miniflare";
import { editorialDatabase, start } from "./authenticationRuntimeHarness";

const origin = "http://authentication.test";
const trpcResponse = z.object({ result: z.object({ data: z.any() }).optional(), error: z.object({ message: z.string(), data: z.object({ code: z.string() }) }).optional() });
async function read(worker: Miniflare, operation: string, input: unknown) {
  const response = await worker.dispatchFetch(`${origin}/api/trpc/blogPublicRead?input=${encodeURIComponent(JSON.stringify({ operation, input }))}`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return trpcResponse.parse(await response.json());
}

test("public Blog reads need no session", async () => {
  const worker = await start();
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('article','antigo',?,'fixture')")
    .bind(JSON.stringify({ status: "published", title: "Antigo", body: "Texto.", slug: "antigo", storyId: "antigo", createdAt: 1, updatedAt: 1, publishedAt: 1 })).run();
  expect((await read(worker, "article", { id: "antigo" })).result?.data).toMatchObject({ kind: "legacy", article: { id: "antigo", title: "Antigo" }, media: [], sources: [], story: null, editorName: null });
  expect((await read(worker, "page", {})).result?.data).toEqual({ items: [{ id: "antigo", title: "Antigo", slug: "antigo", publishedAt: 1 }] });
  expect((await read(worker, "article", { id: "antigo", extra: true })).error?.data.code).toBe("BAD_REQUEST");
});

test("an unexpected public Blog failure is a Blog signal with its route, outside authentication diagnostics", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start();
  // A missing table stands in for an unavailable D1; no Blog read can produce it.
  await (await editorialDatabase()).prepare("DROP TABLE editorial_records").run();
  expect((await read(worker, "page", {})).error).toMatchObject({ message: "Não foi possível carregar o Blog. Tente novamente.", data: { code: "INTERNAL_SERVER_ERROR" } });
  const events = messages.filter(message => message.includes("\"event\":\"blog.public.unavailable\"")).map(message => JSON.parse(message) as { route: string });
  expect(events.map(event => event.route)).toEqual(["/api/trpc/blogPublicRead"]);
  expect(messages.filter(message => message.includes("authentication.worker.failed"))).toEqual([]);
});
