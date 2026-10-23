import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";
import { Miniflare, Response as RuntimeResponse } from "miniflare";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { recordKinds, PersistenceConflict, type RecordQuery } from "@tudomacae/classifieds-persistence";
import { copyMigratedDatabase } from "./migratedDatabase";

let directory: string;
export let runtime: Miniflare;
let options: ConstructorParameters<typeof Miniflare>[0];
const gates = new Map<string, { entered(): void; wait: Promise<void> }>();
export const classifiedsDatabase = () => runtime.getD1Database("CLASSIFIEDS_DB");
export const now = 1_800_000_000_000;
export const profile = (id = "profile") => ({ kind: "profile", id, body: { title: "Negócio", description: "Descrição", userId: "owner", contacts: [{ number: "(22) 99999-9999", isWhatsapp: true }], activityAreas: [{ categoryId: "category", subcategoryId: "subcategory" }], photoPath: `profile-photos/${id}/photo.jpg`, createdAt: now } });
export const ad = (id = "ad", profileId = "profile") => ({ kind: "ad", id, body: { userId: "owner", advertiserProfileId: profileId, title: "Anúncio", status: "active", createdAt: now, images: [{ path: `ad-images/${id}/photo.jpg`, order: 0 }] } });
export const category = (id: string, slug = id) => ({ kind: "category", id, body: { name: id, slug, order: 1, isActive: true } });
export const intent = (key: string) => ({ actorId: "admin", key, operation: "deleteIdentity", input: { id: "profile", confirmedTitle: "Negócio", reason: "Solicitado" } });
export const response = z.object({ value: z.unknown().optional(), error: z.string().optional(), message: z.string().optional(), details: z.record(z.string(), z.unknown()).optional(), metrics: z.array(z.object({ operation: z.string(), statements: z.number(), boundBytes: z.number(), returnedBytes: z.number(), rowsRead: z.number(), rowsWritten: z.number(), durationMs: z.number(), maxParameters: z.number(), maxSqlBytes: z.number() })) });
export async function call(input: object) {
  const result = await runtime.dispatchFetch("http://classifieds.test/", { method: "POST", body: JSON.stringify(input) });
  return response.parse(await result.json());
}
const runtimeRecord = z.object({ kind: z.enum(recordKinds), id: z.string(), body: z.record(z.string(), z.json()), namespace: z.string().optional(), sourceVersion: z.string().optional(), version: z.string() });
const runtimePage = z.object({ items: z.array(runtimeRecord), scope: z.string(), version: z.number(), next: z.string().optional() });
export async function pageInWorker(query: RecordQuery, version?: number) {
  const result = await call({ action: "page", query, version });
  if (result.error === "PersistenceConflict") throw new PersistenceConflict();
  expect(result.error, result.message).toBeUndefined();
  return runtimePage.parse(result.value);
}
export async function save(...records: object[]) {
  const result = await call({ action: "transaction", records });
  expect(result.error, result.message).toBeUndefined();
  return result;
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
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "classifieds-d1-"));
  execFileSync("npm", ["run", "build", "--workspace=@tudomacae/api-worker", "--", "--outdir", directory, "--entry", "tests/classifiedsFixtureWorker.ts"], { stdio: "pipe" });
});
beforeEach(async () => {
  const bundle = (await readdir(directory)).find(file => file.endsWith(".js"))!;
  options = {
    resourcePersistencePath: join(directory, crypto.randomUUID()),
    workers: [{ config: {
      name: "classifieds-test", compatibilityDate: "2026-09-25", compatibilityFlags: ["nodejs_compat"],
      env: { CLASSIFIEDS_DB: { type: "d1", id: "classifieds-test" }, GATE: { type: "fetcher", handler: async (request) => {
        const gate = gates.get(new URL(request.url).pathname.slice(1));
        gate?.entered();
        await gate?.wait;
        return new RuntimeResponse(null, { status: 200 });
      } } },
      manifest: { mainModule: bundle, modules: { [bundle]: { type: "esm", contents: await readFile(join(directory, bundle), "utf8") } }, modulesRoot: directory },
    } }],
  };
  await copyMigratedDatabase(options, join(directory, "template"), "CLASSIFIEDS_DB", ["0001_classifieds.sql", "0002_classifieds_lookups.sql", "0004_classifieds_ad_order.sql", "0007_classifieds_private_owner.sql", "0008_classifieds_personal_profile.sql"]);
  runtime = new Miniflare(options);
  await runtime.ready;
});
export async function restartRuntime() {
  await runtime.dispose();
  runtime = new Miniflare(options);
  await runtime.ready;
}
afterEach(async () => {
  gates.clear();
  await runtime?.dispose();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

export const adminActor = { uid: "admin", admin: true, editor: true, channel: "administration" as const };
export async function capability(operation: string, input: unknown, extra: object = {}) {
  return call({ action: "capability", operation, input, actor: adminActor, ...extra });
}
export async function taxonomy() {
  const categoryId = z.object({ record: z.object({ id: z.string() }) }).parse((await capability("categories.create", { name: "Serviços", isActive: true, idempotencyKey: crypto.randomUUID() })).value).record.id;
  const areas = [];
  for (const name of ["Pintura", "Reparos"]) {
    const subcategoryId = z.object({ record: z.object({ id: z.string() }) }).parse((await capability("subcategories.create", { categoryId, name, isActive: true, idempotencyKey: crypto.randomUUID() })).value).record.id;
    areas.push({ categoryId, subcategoryId });
  }
  return areas;
}
export const adFields = { advertiserProfileId: "profile", title: "Anúncio", text: "Descrição completa do anúncio para publicação.", categoryId: "category", subcategoryId: "subcategory" };
export const ownerActor = { uid: "owner", admin: false, editor: false, emailVerified: true, channel: "administration" as const };
