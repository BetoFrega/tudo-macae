import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";
import { Miniflare, Response as RuntimeResponse } from "miniflare";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

let directory: string;
export let runtime: Miniflare;
const gates = new Map<string, { entered(): void; wait: Promise<void> }>();
export const now = 1_800_000_000_000;
const response = z.object({ value: z.any().optional(), error: z.string().optional(), message: z.string().optional(), code: z.string().optional(), details: z.any().optional() });

export async function call(action: string, input?: unknown, options: object = {}) {
  const result = await runtime.dispatchFetch("http://media.test/", { method: "POST", body: JSON.stringify({ action, input, ...options }) });
  return response.parse(await result.json());
}
export async function ok(action: string, input?: unknown, options: object = {}) {
  const result = await call(action, input, options);
  expect(result.error, result.message).toBeUndefined();
  return result.value;
}
export function barrier(id: string) {
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gates.set(id, { entered, wait });
  return { ready, release };
}

export const provenance = { origin: "own-production", creator: "Maria Souza", credit: "Foto: Maria Souza/Tudo Macaé", displayBasis: "own-production", acquiredAt: now };
export const metadata = (alt = "Orla dos Cavaleiros", caption = "") => ({ kind: "article-image", alt, caption, provenance });
export const register = (alt: string, at = now, status = "staged") => ok("register", { status, metadata: metadata(alt), storagePath: `media/${alt}.webp`, mimeType: "image/webp" }, { now: at });
export const upload = (key: string, size = 100, alt = "Orla dos Cavaleiros") => ({ idempotencyKey: key, size, contentType: "image/webp", metadata: metadata(alt) });
export const reservationOf = (operationId: string) => createHash("sha256").update(operationId).digest("hex");
export async function prepared(operationId: string, size = 100, alt?: string) {
  await ok("prepare", upload(operationId, size, alt), { operationId });
  return reservationOf(operationId);
}

/** Builds the fixture once per file and gives each test a fresh runtime and migrated D1. */
export function setupEditorialMediaRuntime(entry = "tests/editorialMediaFixtureWorker.ts") {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "editorial-media-"));
    execFileSync("pnpm", ["--filter", "@tudomacae/api-worker", "run", "build", "--outdir", directory, "--entry", entry], { stdio: "pipe" });
  });
  beforeEach(async () => {
    const bundle = (await readdir(directory)).find(file => file.endsWith(".js"))!;
    runtime = new Miniflare({
      workers: [{ config: {
        name: "editorial-media-test", compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
        env: { EDITORIAL_DB: { type: "d1", id: "editorial-media-test" }, GATE: { type: "fetcher", handler: async (request) => {
          const gate = gates.get(new URL(request.url).pathname.slice(1));
          gate?.entered();
          await gate?.wait;
          return new RuntimeResponse(null, { status: 200 });
        } } },
        manifest: { mainModule: bundle, modules: { [bundle]: { type: "esm", contents: await readFile(join(directory, bundle), "utf8") } }, modulesRoot: directory },
      } }],
    });
    await runtime.ready;
    // D1 exec requires each complete statement/trigger on one line.
    const database = await runtime.getD1Database("EDITORIAL_DB");
    for (const file of (await readdir("apps/api-worker/migrations-editorial")).sort()) {
      await database.exec(await readFile(join("apps/api-worker/migrations-editorial", file), "utf8"));
    }
  });
  afterEach(async () => {
    gates.clear();
    await runtime.dispose();
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });
}
