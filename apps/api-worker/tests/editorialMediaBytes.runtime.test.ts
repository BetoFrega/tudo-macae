import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { Miniflare } from "miniflare";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";

let directory: string;
let runtime: Miniflare;
const now = Date.now();
const day = 86_400_000;
const response = z.object({ value: z.any().optional(), error: z.string().optional(), message: z.string().optional(), code: z.string().optional() });

async function call(action: string, input?: unknown, options: object = {}) {
  const result = await runtime.dispatchFetch("http://media.test/", { method: "POST", body: JSON.stringify({ action, input, now, ...options }) });
  return response.parse(await result.json());
}
async function ok(action: string, input?: unknown, options: object = {}) {
  const result = await call(action, input, options);
  expect(result.error, result.message).toBeUndefined();
  return result.value;
}

const provenance = { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: now };
const metadata = { kind: "article-image", alt: "Orla dos Cavaleiros", caption: "", provenance };
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const reservationOf = (operationId: string) => createHash("sha256").update(operationId).digest("hex");
const frame = (background: string) => sharp({ create: { width: 64, height: 32, channels: 3, background } }).png().toBuffer();

/** Prepares a reservation for `content` and uploads it through the Hosted quarantine. */
async function uploaded(operationId: string, content: Buffer, contentType = "image/png") {
  await ok("prepare", { idempotencyKey: operationId, size: content.length, contentType, metadata }, { operationId });
  const reservationId = reservationOf(operationId);
  await ok("upload", reservationId, { bytes: base64(content) });
  return reservationId;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "editorial-media-bytes-"));
  execFileSync("npm", ["run", "build", "--workspace=@tudomacae/api-worker", "--", "--outdir", directory, "--entry", "tests/editorialMediaBytesFixtureWorker.ts"], { stdio: "pipe" });
});
beforeEach(async () => {
  const bundle = (await readdir(directory)).find(file => file.endsWith(".js"))!;
  runtime = new Miniflare({ workers: [{ config: {
    name: "editorial-media-bytes", type: "worker", compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
    env: { EDITORIAL_DB: { type: "d1", id: "editorial-media-bytes" }, IMAGES: { type: "images" }, HOSTED: { type: "r2", name: "hosted" } },
    manifest: { mainModule: bundle, modules: { [bundle]: { type: "esm", contents: await readFile(join(directory, bundle), "utf8") } }, modulesRoot: directory },
  } }] });
  await runtime.ready;
  // D1 exec requires each complete statement/trigger on one line.
  const database = await runtime.getD1Database("EDITORIAL_DB");
  for (const file of (await readdir("apps/api-worker/migrations-editorial")).sort()) {
    await database.exec(await readFile(join("apps/api-worker/migrations-editorial", file), "utf8"));
  }
});
afterEach(async () => {
  await runtime.dispose();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("finalizes a quarantined upload into sanitized WebP Media and removes the quarantine after retention", async () => {
  const prepared = await ok("prepare", { idempotencyKey: "first", size: 10, contentType: "image/png", metadata }, { operationId: "first" });
  expect(prepared.upload).toEqual({ url: `https://api.test/media/uploads/${reservationOf("first")}`, method: "PUT", headers: { "content-type": "image/png" } });
  const reservationId = await uploaded("second", await frame("red"));
  const result = await ok("finalize", { reservationId, idempotencyKey: "second" }, { operationId: "second" });
  expect(result).toMatchObject({ status: "created" });
  const stored = Buffer.from(await ok("media", result.digest), "base64");
  expect(createHash("sha256").update(stored).digest("hex")).toBe(result.digest);
  expect(await sharp(stored).metadata()).toMatchObject({ format: "webp", width: 64, height: 32 });
  expect((await ok("record", { kind: "mediaDigest", id: result.digest })).body).toMatchObject({ mediaId: result.mediaId, object: { status: "pending" } });

  expect((await ok("sweep", 10, { now: now + 2 * day })).removedReservationIds.sort()).toEqual([reservationOf("first"), reservationId].sort());
  expect((await ok("record", { kind: "uploadReservation", id: reservationId })).body.upload).toMatchObject({ status: "retired" });
  expect(await ok("media", result.digest)).toBeTruthy();
});

test("two uploads of the same image share one sanitized object and the second reports the duplicate", async () => {
  const content = await frame("blue");
  const first = await ok("finalize", { reservationId: await uploaded("first", content), idempotencyKey: "first" }, { operationId: "first" });
  const second = await ok("finalize", { reservationId: await uploaded("second", content), idempotencyKey: "second" }, { operationId: "second" });
  expect(second).toEqual({ ...first, status: "duplicate" });
});

test("refuses uploads that diverge from the reservation", async () => {
  const content = await frame("green");
  await ok("prepare", { idempotencyKey: "short", size: content.length + 1, contentType: "image/png", metadata }, { operationId: "short" });
  expect(await call("upload", reservationOf("short"), { bytes: base64(content) })).toMatchObject({ code: "validationFailed" });

  const reservationId = await uploaded("replaced", content);
  const other = Buffer.from(content);
  other[other.length - 1] ^= 1;
  expect(await call("upload", reservationId, { bytes: base64(other) })).toMatchObject({ code: "validationFailed" });

  await ok("prepare", { idempotencyKey: "late", size: content.length, contentType: "image/png", metadata }, { operationId: "late" });
  expect(await call("upload", reservationOf("late"), { bytes: base64(content), now: now + day })).toMatchObject({ code: "validationFailed" });
  expect(await call("finalize", { reservationId: reservationOf("late"), idempotencyKey: "late" }, { operationId: "late" })).toMatchObject({ code: "validationFailed", message: expect.stringContaining("ainda não foi enviado") });
});

test("an upload losing a race to other bytes is refused instead of answered as uploaded", async () => {
  const content = await frame("green");
  const other = Buffer.from(content);
  other[other.length - 1] ^= 1;
  await ok("prepare", { idempotencyKey: "raced", size: content.length, contentType: "image/png", metadata }, { operationId: "raced" });
  expect(await call("upload", reservationOf("raced"), { bytes: base64(content), racedBytes: base64(other) }))
    .toMatchObject({ code: "validationFailed", message: "A reserva já recebeu outro arquivo." });
});

test.each([
  ["animated GIF", async () => sharp([await frame("red"), await frame("blue")], { join: { animated: true } }).gif().toBuffer(), "image/gif"],
  ["animated WebP", async () => sharp([await frame("red"), await frame("blue")], { join: { animated: true } }).webp().toBuffer(), "image/webp"],
  ["corrupt PNG", async () => Buffer.concat([(await frame("red")).subarray(0, 40), Buffer.alloc(40)]), "image/png"],
  ["oversized dimensions", () => sharp({ create: { width: 8193, height: 2, channels: 3, background: "white" } }).png().toBuffer(), "image/png"],
] as const)("refuses to finalize an %s", async (_name, build, contentType) => {
  const reservationId = await uploaded("refused", await build(), contentType);
  expect(await call("finalize", { reservationId, idempotencyKey: "refused" }, { operationId: "refused" })).toMatchObject({ code: "validationFailed" });
});

test("a digest journal naming another sanitized object is a failure, not that object's bytes", async () => {
  const red = await ok("finalize", { reservationId: await uploaded("red", await frame("red")), idempotencyKey: "red" }, { operationId: "red" });
  const blue = await ok("finalize", { reservationId: await uploaded("blue", await frame("blue")), idempotencyKey: "blue" }, { operationId: "blue" });
  // A hand-copied journal stands in for an incompatible import; no Media operation writes one.
  const database = await runtime.getD1Database("EDITORIAL_DB");
  const { body } = (await database.prepare("SELECT body FROM editorial_records WHERE kind = 'mediaDigest' AND id = ?").bind(blue.digest).first<{ body: string }>())!;
  await database.prepare("UPDATE editorial_records SET body = json_set(body, '$.object', json(?)) WHERE kind = 'mediaDigest' AND id = ?").bind(JSON.stringify(JSON.parse(body).object), red.digest).run();
  expect(await call("media", red.digest)).toMatchObject({ message: "Invalid persisted Media data." });
});

test("a digest claim naming Media of another digest is a failure, not that Media as the canonical duplicate", async () => {
  const red = await ok("finalize", { reservationId: await uploaded("red", await frame("red")), idempotencyKey: "red" }, { operationId: "red" });
  const blue = await ok("finalize", { reservationId: await uploaded("blue", await frame("blue")), idempotencyKey: "blue" }, { operationId: "blue" });
  // A hand-edited claim stands in for an incompatible import; no Media operation writes one.
  await (await runtime.getD1Database("EDITORIAL_DB")).prepare("UPDATE editorial_records SET body = json_set(body, '$.mediaId', ?) WHERE kind = 'mediaDigest' AND id = ?").bind(blue.mediaId, red.digest).run();
  const again = await call("finalize", { reservationId: await uploaded("red-again", await frame("red")), idempotencyKey: "red-again" }, { operationId: "red-again" });
  expect(again).toMatchObject({ message: "Invalid persisted Media data." });
});

test("an upload journal naming another reservation, or a prepared reservation naming a finalization, is a failure", async () => {
  const red = await uploaded("red", await frame("red"));
  const blue = await uploaded("blue", await frame("blue"));
  // A hand-copied journal stands in for an incompatible import; no Media operation writes one.
  await (await runtime.getD1Database("EDITORIAL_DB")).prepare("UPDATE editorial_records SET body = json_set(body, '$.upload', (SELECT json_extract(body, '$.upload') FROM editorial_records WHERE kind = 'uploadReservation' AND id = ?)) WHERE kind = 'uploadReservation' AND id = ?").bind(blue, red).run();
  expect(await call("finalize", { reservationId: red, idempotencyKey: "red" }, { operationId: "red" })).toMatchObject({ message: "Invalid persisted Media data." });
  // A prepared reservation naming a finalization would refuse every legitimate finalization as a duplicate.
  await (await runtime.getD1Database("EDITORIAL_DB")).prepare("UPDATE editorial_records SET body = json_set(body, '$.finalizationId', 'unknown') WHERE kind = 'uploadReservation' AND id = ?").bind(blue).run();
  expect(await call("finalize", { reservationId: blue, idempotencyKey: "blue" }, { operationId: "blue" })).toMatchObject({ message: "Invalid persisted Media data." });
});

test("a finalized result or digest claim naming Media without that sanitized asset, or a reservation with a malformed owner, is a failure", async () => {
  const red = await ok("finalize", { reservationId: await uploaded("red", await frame("red")), idempotencyKey: "red" }, { operationId: "red" });
  await ok("finalize", { reservationId: await uploaded("blue", await frame("blue")), idempotencyKey: "blue" }, { operationId: "blue" });
  // Hand-edited rows stand in for an incompatible import; no Media operation writes them.
  const edit = async (kind: string, id: string, change: string, ...values: unknown[]) => (await runtime.getD1Database("EDITORIAL_DB")).prepare(`UPDATE editorial_records SET body = json_set(body, ${change}) WHERE kind = ? AND id = ?`).bind(...values, kind, id).run();
  await edit("uploadReservation", reservationOf("blue"), "'$.result.mediaId', ?", red.mediaId);
  expect(await call("finalize", { reservationId: reservationOf("blue"), idempotencyKey: "blue" }, { operationId: "blue" })).toMatchObject({ message: "Invalid persisted Media data." });
  await edit("media", red.mediaId, "'$.storagePath', 'media/red.webp'");
  const again = await call("finalize", { reservationId: await uploaded("red-again", await frame("red")), idempotencyKey: "red-again" }, { operationId: "red-again" });
  expect(again).toMatchObject({ message: "Invalid persisted Media data." });
  await ok("prepare", { idempotencyKey: "owner", size: 10, contentType: "image/png", metadata }, { operationId: "owner" });
  await edit("uploadReservation", reservationOf("owner"), "'$.ownerId', ''");
  expect(await call("upload", reservationOf("owner"), { bytes: base64(new Uint8Array(10)) })).toMatchObject({ message: "Invalid persisted Media data." });
});
