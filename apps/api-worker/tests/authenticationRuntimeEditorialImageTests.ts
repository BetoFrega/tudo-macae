import { expect, test, vi } from "vitest";
import sharp from "sharp";
import z from "zod";
import type { Miniflare } from "miniflare";
import { createEditorialPersistence } from "../editorial";
import { authenticationDatabase, editorialDatabase, start } from "./authenticationRuntimeHarness";

const origin = "http://authentication.test";
const provenance = { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: 1_700_000_000_000 };
const requestId = "01234567-89ab-4def-8123-456789abcdef";

/** Sanitized Media stored through the editor's upload, so Hosted Images holds its bytes. */
async function uploadedMedia(worker: Miniflare) {
  const created = await worker.dispatchFetch(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email: "image-editor@example.com", password: "abc123" }) });
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json()).user.id;
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify({ editor: true }), uid).run();
  const cookie = created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]!;
  const write = async (operation: string, input: unknown) => (await (await worker.dispatchFetch(`${origin}/api/trpc/mediaWrite`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ operation, input }) })).json() as { result: { data: Record<string, string> } }).result.data;
  const bytes = new Uint8Array(await sharp({ create: { width: 64, height: 32, channels: 3, background: "red" } }).png().toBuffer());
  const { reservationId } = await write("ingestion.prepare", { idempotencyKey: "upload", size: bytes.length, contentType: "image/png", metadata: { kind: "article-image", alt: "Orla", caption: "", provenance } });
  await worker.dispatchFetch(`${origin}/api/media/uploads/${reservationId}`, { method: "PUT", headers: { cookie, origin, "content-type": "image/png" }, body: bytes });
  const { mediaId, digest } = await write("ingestion.finalize", { reservationId, idempotencyKey: "upload" });
  return { mediaId: mediaId!, digest: digest! };
}

/** A post whose receipt grants the Media, as the Blog publishes it. */
async function publish(articleId: string, mediaId: string, digest: string, publishedAt: number) {
  const database = await editorialDatabase();
  await database.prepare("UPDATE editorial_records SET body=json_set(body,'$.status','active') WHERE kind='media' AND id=?").bind(mediaId).run();
  const operationId = `blog-${articleId}`;
  const grant = { operationId, articleId, mediaId, revision: 1, digest };
  const persistence = createEditorialPersistence({ database });
  await persistence.importRecord({ kind: "article", id: articleId, body: { status: "published", title: "Praia", slug: "praia", body: "Texto.", mediaIds: [mediaId], publicationReceiptId: operationId, publishedAt, createdAt: 1, updatedAt: 1 } });
  await persistence.importRecord({ kind: "publicationReceipt", id: operationId, body: { operationId, articleId, status: "completed", content: { title: "Praia", body: "Texto.", path: `/noticia/${articleId}/praia`, sources: [], media: [] }, grants: [grant] } });
  await persistence.importRecord({ kind: "publicationGrant", id: `${operationId.length}-${operationId}${mediaId}`, body: grant });
}

const get = (worker: Miniflare, path: string, method = "GET") => worker.dispatchFetch(`${origin}${path}`, { method, headers: { "x-request-id": requestId } });
function expectOriginHeaders(response: { headers: { get(name: string): string | null } }) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-request-id")).toBe(requestId);
}

test("the public image origin serves only Media granted to a published post, once the Worker owns editorial writes", async () => {
  const worker = await start();
  const { mediaId, digest } = await uploadedMedia(worker);
  const originPath = `/api/imagens/editorial/${mediaId}/${digest}`;
  const articlePath = `/api/noticia/post/midias/${mediaId}`;
  // Staged and ungranted Media is no public image, even with bytes in Hosted Images.
  for (const path of [originPath, articlePath]) {
    const absent = await get(worker, path);
    expect(absent.status).toBe(404);
    expectOriginHeaders(absent);
  }
  await publish("post", mediaId, digest, Date.now() - 1000);
  for (const path of [originPath, articlePath]) {
    const served = await get(worker, path);
    expect(served.status).toBe(200);
    expectOriginHeaders(served);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(await sharp(Buffer.from(await served.arrayBuffer())).metadata()).toMatchObject({ format: "webp", width: 64, height: 32 });
  }
  // The article path carries the Media ID percent-encoded, as any ID within the Media contract travels.
  const encoded = `/api/noticia/post/midias/%${mediaId.charCodeAt(0).toString(16).toUpperCase()}${mediaId.slice(1)}`;
  expect((await get(worker, encoded)).status).toBe(200);
  expect((await get(worker, "/api/noticia/post/midias/%E0%A4%A")).status).toBe(404);
  for (const path of [originPath, articlePath]) {
    const head = await get(worker, path, "HEAD");
    expect([head.status, head.headers.get("content-type"), await head.text()]).toEqual([200, "image/webp", ""]);
  }
  expect((await worker.dispatchFetch(`${origin}${originPath}`, { method: "POST", headers: { origin } })).status).toBe(405);
  expect((await get(worker, `/api/imagens/editorial/${mediaId}/${"0".repeat(64)}`)).status).toBe(404);
  expect((await get(worker, `/api/noticia/other/midias/${mediaId}`)).status).toBe(404);
  // A receipt grant serves nothing once the current Media record no longer backs its digest.
  const backing = (value: string) => editorialDatabase().then(database => database.prepare("UPDATE editorial_records SET body=json_set(body,'$.digest',?) WHERE kind='media' AND id=?").bind(value, mediaId).run());
  await backing("b".repeat(64));
  expect((await get(worker, articlePath)).status).toBe(404);
  await backing(digest);
  // A post taken offline withdraws the grant's publication on the next miss.
  await (await editorialDatabase()).prepare("UPDATE editorial_records SET body=json_set(body,'$.status','draft') WHERE kind='article' AND id='post'").run();
  for (const path of [originPath, articlePath]) expect((await get(worker, path)).status).toBe(404);
});

test("an image read failure answers 502 and is a Blog signal naming its stage", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start();
  const { mediaId, digest } = await uploadedMedia(worker);
  await publish("post", mediaId, digest, Date.now() - 1000);
  // A lost digest journal stands in for unreadable storage; no Media operation removes the bytes of granted Media.
  await (await editorialDatabase()).prepare("UPDATE editorial_records SET body=json_set(body,'$.object.digest',?) WHERE kind='mediaDigest' AND id=?").bind("f".repeat(64), digest).run();
  const failed = await get(worker, `/api/imagens/editorial/${mediaId}/${digest}`);
  expect([failed.status, await failed.text()]).toEqual([502, ""]);
  expectOriginHeaders(failed);
  // The app relays this 502 without logging it again.
  expect(failed.headers.get("x-blog-public-error-reported")).toBe("1");
  const events = messages.filter(message => message.includes("\"event\":\"blog.public.unavailable\"")).map(message => JSON.parse(message) as { route: string; operation?: string });
  expect(events).toEqual([expect.objectContaining({ route: "/api/imagens/editorial/:mediaId/:digest", operation: "storage", requestId })]);
  expect(messages.filter(message => message.includes("authentication.worker.failed"))).toEqual([]);
});

test("published Media whose bytes are gone is a storage failure, not a missing image", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start();
  const { mediaId, digest } = await uploadedMedia(worker);
  await publish("post", mediaId, digest, Date.now() - 1000);
  await (await editorialDatabase()).prepare("DELETE FROM editorial_records WHERE kind='mediaDigest' AND id=?").bind(digest).run();
  for (const path of [`/api/imagens/editorial/${mediaId}/${digest}`, `/api/noticia/post/midias/${mediaId}`]) {
    const failed = await get(worker, path);
    expect(failed.status).toBe(502);
    expect(failed.headers.get("x-blog-public-error-reported")).toBe("1");
  }
  const operations = messages.filter(message => message.includes("\"event\":\"blog.public.unavailable\"")).map(message => (JSON.parse(message) as { operation?: string }).operation);
  expect(operations).toEqual(["storage", "storage"]);
});
