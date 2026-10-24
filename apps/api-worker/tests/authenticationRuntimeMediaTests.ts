import { expect, test, vi } from "vitest";
import sharp from "sharp";
import z from "zod";
import type { Miniflare } from "miniflare";
import { mediaOwnerId } from "@tudomacae/editorial-media/owner";
import { createEditorialPersistence } from "../editorial";
import { authenticationDatabase, editorialDatabase, start } from "./authenticationRuntimeHarness";

const origin = "http://authentication.test";
const trpcResponse = z.object({ result: z.object({ data: z.any() }).optional(), error: z.object({ message: z.string(), data: z.object({ code: z.string(), media: z.object({ code: z.string().optional() }).optional() }) }).optional() });
const provenance = { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: 1_700_000_000_000 };
const metadata = { kind: "article-image", alt: "Orla dos Cavaleiros", caption: "", provenance };

async function account(worker: Miniflare, email: string, claims: Record<string, boolean>) {
  const created = await worker.dispatchFetch(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email, password: "abc123" }) });
  const uid = z.object({ user: z.object({ id: z.string() }) }).parse(await created.json()).user.id;
  await (await authenticationDatabase()).prepare("UPDATE user SET claims=? WHERE id=?").bind(JSON.stringify(claims), uid).run();
  return { uid, cookie: created.headers.getSetCookie().find(item => item.startsWith("session="))!.split(";")[0]! };
}

function media(worker: Miniflare, cookie: string) {
  const call = async (response: Promise<{ json(): Promise<unknown> }>) => trpcResponse.parse(await (await response).json());
  return {
    read: (operation: string, input: unknown) => call(worker.dispatchFetch(`${origin}/api/trpc/mediaRead?input=${encodeURIComponent(JSON.stringify({ operation, input }))}`, { headers: { cookie } })),
    write: (operation: string, input: unknown) => call(worker.dispatchFetch(`${origin}/api/trpc/mediaWrite`, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify({ operation, input }) })),
    put: (path: string, bytes: Uint8Array, type = "image/png") => worker.dispatchFetch(`${origin}${path}`, { method: "PUT", headers: { cookie, origin, "content-type": type }, body: bytes }),
    get: (path: string) => worker.dispatchFetch(`${origin}${path}`, { headers: { cookie } }),
  };
}

const image = async () => new Uint8Array(await sharp({ create: { width: 64, height: 32, channels: 3, background: "red" } }).png().toBuffer());

test("Media routes open to editors and refuse other accounts", async () => {
  const worker = await start();
  const editor = media(worker, (await account(worker, "media-editor@example.com", { editor: true })).cookie);
  expect((await editor.read("search", {})).result?.data).toEqual({ media: [] });
  const visitor = media(worker, (await account(worker, "visitor@example.com", {})).cookie);
  expect((await visitor.read("search", {})).error?.data.code).toBe("FORBIDDEN");
});

test("an editor uploads through the reservation it owns and previews the sanitized Media", async () => {
  const worker = await start();
  const editor = media(worker, (await account(worker, "editor@example.com", { editor: true })).cookie);
  const other = media(worker, (await account(worker, "other-editor@example.com", { editor: true })).cookie);
  const bytes = await image();
  const prepared = (await editor.write("ingestion.prepare", { idempotencyKey: "upload", size: bytes.length, contentType: "image/png", metadata })).result!.data;
  expect(prepared.upload).toEqual({ url: `${origin}/midia/envios/${prepared.reservationId}`, method: "PUT", headers: { "content-type": "image/png" } });
  const path = `/api/media/uploads/${prepared.reservationId}`;
  expect((await other.put(path, bytes)).status).toBe(403);
  expect((await editor.put(path, bytes.subarray(1))).status).toBe(400);
  // The reserved type binds the signed header and the bytes' own signature.
  const jpegSignature = Uint8Array.from(bytes, (byte, index) => index < 3 ? [0xff, 0xd8, 0xff][index]! : byte);
  for (const [body, type] of [[bytes, "image/jpeg"], [jpegSignature, "image/png"]] as const) expect((await editor.put(path, body, type)).status).toBe(400);
  const stored = await editor.put(path, bytes);
  expect(stored.status).toBe(204);
  expect(stored.headers.get("cache-control")).toBe("private, no-store");
  const otherBytes = bytes.slice();
  otherBytes[bytes.length - 1]! ^= 1;
  // A retry of the same bytes succeeds; other bytes are refused, never answered 409, which clients read as uploaded.
  expect((await editor.put(path, bytes)).status).toBe(204);
  expect((await editor.put(path, otherBytes)).status).toBe(400);

  const finalized = (await editor.write("ingestion.finalize", { reservationId: prepared.reservationId, idempotencyKey: "upload" })).result!.data;
  expect(finalized).toMatchObject({ status: "created" });
  expect((await editor.read("get", finalized.mediaId)).result!.data).toMatchObject({ id: finalized.mediaId, status: "staged", alt: "Orla dos Cavaleiros" });
  const preview = await other.get(`/api/media/content/${finalized.mediaId}`);
  expect(preview.status).toBe(200);
  expect(preview.headers.get("cache-control")).toBe("private, no-store");
  expect(await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).toMatchObject({ format: "webp", width: 64, height: 32 });
  expect((await editor.get("/api/media/content/%ZZ")).status).toBe(400);
  const visitor = media(worker, (await account(worker, "preview-visitor@example.com", {})).cookie);
  expect((await visitor.get(`/api/media/content/${finalized.mediaId}`)).status).toBe(403);
  // A non-ASCII id longer than 200 encoded characters still reaches the route, which refuses the visitor.
  expect((await visitor.get(`/api/media/content/${encodeURIComponent("é".repeat(34))}`)).status).toBe(403);
  // A lost digest journal stands in for missing storage; no Media operation removes the bytes of canonical Media.
  await (await editorialDatabase()).prepare("DELETE FROM editorial_records WHERE kind = 'mediaDigest' AND id = ?").bind(finalized.digest).run();
  expect((await other.get(`/api/media/content/${finalized.mediaId}`)).status).toBe(503);
});

test("administrative operations refuse editors and Media use needs an imported Source Permission", async () => {
  const worker = await start();
  const editor = media(worker, (await account(worker, "limited-editor@example.com", { editor: true })).cookie);
  expect((await editor.read("unreferenced", {})).error?.data.code).toBe("FORBIDDEN");
  expect((await editor.write("update", { id: "media", expectedRevision: 1, metadata })).error?.data.code).toBe("FORBIDDEN");
  const permitted = { ...metadata, provenance: { ...provenance, origin: "third-party", provider: "Agência", displayBasis: "permission", permissionReference: "permission" } };
  const refused = await editor.write("ingestion.prepare", { idempotencyKey: "permitted", size: 10, contentType: "image/png", metadata: permitted });
  expect(refused.error?.data).toMatchObject({ code: "FORBIDDEN", media: { code: "forbidden" } });
  const persistence = createEditorialPersistence({ database: await editorialDatabase() });
  await persistence.importRecord({ kind: "legacy", namespace: "news_source_permissions", id: "permission", body: { capability: "mediaUse", validFrom: 0, expiresAt: Number.MAX_SAFE_INTEGER } });
  const accepted = await editor.write("ingestion.prepare", { idempotencyKey: "permitted", size: 10, contentType: "image/png", metadata: permitted });
  expect(accepted.error).toBeUndefined();
  const administrator = media(worker, (await account(worker, "media-admin@example.com", { admin: true })).cookie);
  expect((await administrator.read("unreferenced", {})).result?.data).toEqual({ media: [] });
  // A dual-role account edits as an Editor, through `correct` and its reason, never through a direct update.
  const dualRole = media(worker, (await account(worker, "dual-role@example.com", { admin: true, editor: true })).cookie);
  expect((await dualRole.write("update", { id: "media", expectedRevision: 1, metadata })).error?.data.code).toBe("FORBIDDEN");
});

test("the hourly cron sweeps due quarantine reservations", async () => {
  const worker = await start();
  const persistence = createEditorialPersistence({ database: await editorialDatabase() });
  // One more than a sweep page, so one run must drain two.
  const ids = ["due", ...Array.from({ length: 25 }, (_, index) => `due-${index}`)];
  await persistence.transact(null, async (tx) => {
    for (const id of ids) {
      await tx.read("uploadReservation", id);
      tx.put({ kind: "uploadReservation", id, body: { id, ownerId: "0".repeat(64), status: "expired", createdAt: 1, expiresAt: 1, cleanupAt: 1, cleanupPending: true } });
    }
    return null;
  });
  await (await worker.getWorker()).scheduled({ scheduledTime: new Date() });
  for (const id of ids) expect((await persistence.read("uploadReservation", id))?.body).toMatchObject({ cleanupPending: false, status: "expired" });
});

test("an unexpected Media failure is a Media signal with its normalized route, outside authentication diagnostics", async () => {
  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation(value => messages.push(String(value)));
  const worker = await start();
  const failing = await account(worker, "failing-editor@example.com", { editor: true });
  const editor = media(worker, failing.cookie);
  // An intent without its caller, input or timestamp stands in for an incompatible import.
  const ownerId = mediaOwnerId({ channel: "newsroom", editorId: failing.uid });
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('ingestionIntent',?,?,'fixture')").bind("b".repeat(64), JSON.stringify({ id: "b".repeat(64), ownerId, status: "pending", operation: "prepare" })).run();
  expect((await editor.read("ingestion.get", "b".repeat(64))).error?.data.code).toBe("INTERNAL_SERVER_ERROR");
  // A prepare intent whose input lost its size, type and metadata is as corrupt as one without input.
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('ingestionIntent',?,?,'fixture')").bind("c".repeat(64), JSON.stringify({ id: "c".repeat(64), ownerId, status: "pending", operation: "prepare", caller: { channel: "newsroom", editorId: failing.uid }, input: { idempotencyKey: "partial" }, createdAt: 1 })).run();
  expect((await editor.read("ingestion.get", "c".repeat(64))).error?.data.code).toBe("INTERNAL_SERVER_ERROR");
  // A newsroom caller carrying an administrator would record that administrator in the activity of this intent.
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('ingestionIntent',?,?,'fixture')").bind("e".repeat(64), JSON.stringify({ id: "e".repeat(64), ownerId, status: "pending", operation: "prepare", caller: { channel: "newsroom", editorId: failing.uid, administratorId: "admin" }, input: { idempotencyKey: "cross", size: 10, contentType: "image/png", metadata }, createdAt: 1 })).run();
  expect((await editor.read("ingestion.get", "e".repeat(64))).error?.data.code).toBe("INTERNAL_SERVER_ERROR");
  // A reservation without an owner or a known state is corrupt, so its upload is a server failure, not another caller's reservation.
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('uploadReservation',?,?,'fixture')").bind("d".repeat(64), JSON.stringify({ id: "d".repeat(64), status: "imported" })).run();
  const corruptUpload = await editor.put(`/api/media/uploads/${"d".repeat(64)}`, new Uint8Array([1]));
  expect([corruptUpload.status, await corruptUpload.json()]).toEqual([503, { error: "Não foi possível acessar o acervo de mídia. Tente novamente." }]);
  // A malformed row stands in for incompatible persisted data; no Media operation writes one.
  await (await editorialDatabase()).prepare("INSERT INTO editorial_records(kind,id,body,version) VALUES('media','corrupt','{\"status\":42}','fixture')").run();
  expect((await editor.read("get", "corrupt")).error?.data.code).toBe("INTERNAL_SERVER_ERROR");
  // A missing table stands in for an unavailable D1; no Media operation can produce it.
  await (await editorialDatabase()).prepare("DROP TABLE editorial_records").run();
  const unavailable = await editor.read("search", {});
  expect(unavailable.error).toMatchObject({ message: "Não foi possível acessar o acervo de mídia. Tente novamente.", data: { code: "INTERNAL_SERVER_ERROR" } });
  const content = await editor.get("/api/media/content/media");
  expect([content.status, await content.json()]).toEqual([503, { error: "Não foi possível acessar o acervo de mídia. Tente novamente." }]);
  expect(content.headers.get("x-media-error-reported")).toBe("1");
  const events = messages.filter(message => message.includes("\"event\":\"media.request.unavailable\"")).map(message => JSON.parse(message) as { route: string; operation?: string });
  // A multiplexed procedure names its operation, so operators can tell an ingestion read from a search.
  expect(events.map(event => event.operation)).toEqual(["ingestion.get", "ingestion.get", "ingestion.get", undefined, "get", "search", undefined]);
  expect(events.map(event => event.route)).toEqual(["/api/trpc/mediaRead", "/api/trpc/mediaRead", "/api/trpc/mediaRead", "/api/media/uploads/:reservationId", "/api/trpc/mediaRead", "/api/trpc/mediaRead", "/api/media/content/:mediaId"]);
  expect(messages.filter(message => message.includes("authentication.worker.failed"))).toEqual([]);
});

test("a correction that writes nothing is an error, and an account row that no longer parses is a server failure", async () => {
  const worker = await start();
  const editing = await account(worker, "correcting-editor@example.com", { editor: true });
  const editor = media(worker, editing.cookie);
  const correction = { mediaId: "missing", expectedRevision: 1, metadata: { alt: "Orla", caption: "", provenance }, reason: "Descrição mais precisa" };
  expect((await editor.write("correct", correction)).error?.data.code).toBe("NOT_FOUND");
  // Claims stored as a list stand in for an incompatible account row; no account operation writes one.
  await (await authenticationDatabase()).prepare("UPDATE user SET claims='[]' WHERE id=?").bind(editing.uid).run();
  expect((await editor.read("search", {})).error?.data.code).toBe("INTERNAL_SERVER_ERROR");
});
