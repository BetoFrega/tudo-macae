import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";
import { Miniflare, Response as RuntimeResponse } from "miniflare";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import sharp from "sharp";
import { recordKinds, type RecordKind } from "@tudomacae/classifieds-persistence";
import { copyMigratedDatabase } from "./migratedDatabase";
export const classifiedsDatabase = () => runtime.getD1Database("CLASSIFIEDS_DB");
export const now = 1_800_000_000_000;
let directory: string;
export let runtime: Miniflare;
export let options: ConstructorParameters<typeof Miniflare>[0];
export const gates = new Map<string, { entered(): void; wait: Promise<void> }>();
const response = z.object({ value: z.unknown().optional(), error: z.string().optional(), code: z.union([z.string(), z.number()]).optional(), events: z.array(z.unknown()) });
export async function call(input: object) {
  return response.parse(await (await runtime.dispatchFetch("http://photos.test/", { method: "POST", body: JSON.stringify(input) })).json());
}
export function startRuntime() {
  runtime = new Miniflare(options);
}
const runtimeRecord = z.object({ kind: z.enum(recordKinds), id: z.string(), body: z.record(z.string(), z.json()), namespace: z.string().optional(), sourceVersion: z.string().optional(), version: z.string() });
export async function readRecord(kind: RecordKind, id: string, namespace?: string) {
  const result = await call({ action: "record", kind, id, namespace });
  expect(result.error).toBeUndefined();
  return runtimeRecord.nullable().parse(result.value);
}
export async function readRecords(query: { kind: RecordKind }) {
  const result = await call({ action: "records", kind: query.kind });
  expect(result.error).toBeUndefined();
  return z.object({ items: z.array(runtimeRecord) }).parse(result.value);
}
export let png: number[];
export const upload = (ownerKind: "ad" | "profile" = "ad") => ({ ownerKind, ownerId: ownerKind, operationId: crypto.randomUUID(), expectedRevision: 1, mimeType: "image/png", bytes: png });
export const photo = z.object({ path: z.string(), generation: z.string(), status: z.string() });
async function seed() {
  expect((await call({ action: "save", records: [
    { kind: "profile", id: "profile", body: { userId: "owner", title: "Perfil", contacts: [{ number: "22999998888", isWhatsapp: true }], createdAt: now } },
    { kind: "ad", id: "ad", body: { userId: "owner", advertiserProfileId: "profile", title: "Anúncio", text: "Descrição completa do anúncio para publicação.", slug: "anuncio", categoryId: "categoria", subcategoryId: "subcategoria", status: "active", publicationState: "pending", createdAt: now, images: [] } },
  ] })).error).toBeUndefined();
}
beforeAll(async () => {
  png = [...await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer()];
  directory = await mkdtemp(join(tmpdir(), "classifieds-photos-"));
  execFileSync("npm", ["run", "build", "--workspace=@tudomacae/api-worker", "--", "--outdir", directory, "--entry", "tests/photosFixtureWorker.ts"], { stdio: "pipe" });
});
beforeEach(async () => {
  const bundle = (await readdir(directory)).find(file => file.endsWith(".js"))!;
  options = { resourcePersistencePath: join(directory, crypto.randomUUID()), workers: [{ config: {
    name: "photos", type: "worker", compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
    env: { IMAGES: { type: "images" }, CLASSIFIEDS_DB: { type: "d1", id: "photos" }, AUTHENTICATION_DB: { type: "d1", id: "photos-authentication" }, PHOTOS: { type: "r2", name: "photos" }, GATE: { type: "fetcher", handler: async (request) => {
      const gate = gates.get(new URL(request.url).pathname.slice(1));
      gate?.entered();
      await gate?.wait;
      return new RuntimeResponse(null);
    } } }, manifest: { mainModule: bundle, modules: { [bundle]: { type: "esm", contents: await readFile(join(directory, bundle), "utf8") } }, modulesRoot: directory },
  } }] };
  await copyMigratedDatabase(options, join(directory, "template"), "CLASSIFIEDS_DB", ["0001_classifieds.sql", "0002_classifieds_lookups.sql", "0003_classifieds_photos.sql", "0004_classifieds_ad_order.sql", "0005_classifieds_cleanup_handoffs.sql", "0007_classifieds_private_owner.sql"]);
  startRuntime();
  await runtime.ready;
  // The production scheduled path also expires authentication rows.
  const authentication = await runtime.getD1Database("AUTHENTICATION_DB");
  for (const file of (await readdir("apps/api-worker/migrations")).filter(file => file.endsWith(".sql")).sort())
    await authentication.exec(await readFile(join("apps/api-worker/migrations", file), "utf8"));
  await seed();
});
afterEach(async () => {
  gates.clear();
  await runtime?.dispose();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
export const capability = (operation: string, input: object = {}, mutation = true, extra: object = {}) => call({ action: "capability", capability: { operation, input: operation === "publications.photos" ? { operationId: crypto.randomUUID(), ...input } : input, mutation }, ...extra });
export const draft = { id: "draft-legado-!", title: "Bicicleta", text: "Bicicleta usada em ótimo estado de conservação.", categoryId: "categoria", subcategoryId: "subcategoria" };
export const account = (uid = "owner", emailVerified = true, admin = false) => ({ uid, emailVerified, admin, editor: false, channel: "administration" });
