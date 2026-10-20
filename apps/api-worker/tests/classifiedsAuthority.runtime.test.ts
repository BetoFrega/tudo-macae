import { createApiWorker } from "../index";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createProductionClassifiedsDependencies } from "../production";
import { readClassifiedsAuthority } from "../lib/db/classifiedsAuthority";
let runtime: Miniflare;
let db: D1Database;
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "classifieds-authority-"));
  runtime = new Miniflare({ resourcePersistencePath: directory, workers: [{ config: { name: "authority", type: "worker", compatibilityDate: "2026-09-25", env: { CLASSIFIEDS_DB: { type: "d1", id: "authority" } },
    manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: "export default { fetch() { return new Response('ok'); } };" } }, modulesRoot: directory } } }] });
  await runtime.ready;
  db = await runtime.getD1Database("CLASSIFIEDS_DB");
  await db.exec(await readFile("apps/api-worker/migrations-classifieds/0006_classifieds_authority.sql", "utf8"));
});
afterEach(async () => {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
});
test("the durable authority alone decides, without any outbound request", async () => {
  const send = vi.fn<typeof fetch>();
  const env = { CLASSIFIEDS_DB: db, WORKERS_ENVIRONMENT: "production" } as Env;
  const dependencies = createProductionClassifiedsDependencies(env, send);
  expect(await dependencies.classifiedsAuthority!()).toBe("legacy");
  expect(await dependencies.classifiedsQualification!()).toBe(false);
  await db.prepare("UPDATE classifieds_authority SET authority = 'worker' WHERE id = 1").run();
  expect(await dependencies.classifiedsAuthority!()).toBe("worker");
  expect(await dependencies.classifiedsQualification!()).toBe(true);
  expect(send).not.toHaveBeenCalled();
});
test("durable cutover cannot regress or disappear", async () => {
  await db.prepare("UPDATE classifieds_authority SET authority = 'worker' WHERE id = 1").run();
  await expect(db.prepare("UPDATE classifieds_authority SET authority = 'legacy' WHERE id = 1").run()).rejects.toThrow();
  await expect(db.prepare("DELETE FROM classifieds_authority WHERE id = 1").run()).rejects.toThrow();
  expect(await readClassifiedsAuthority(db)).toBe("worker");
});

test("the authority HTTP endpoint returns no cacheable state and fails closed when the durable read fails", async () => {
  const env = { CLASSIFIEDS_DB: db, WORKERS_ENVIRONMENT: "production", AUTHENTICATION_DIAGNOSTICS_ENABLED: "false" } as Env;
  const worker = createApiWorker(createProductionClassifiedsDependencies(env));
  const logs = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await db.prepare("UPDATE classifieds_authority SET authority = 'worker' WHERE id = 1").run();
    const current = await worker.fetch(new Request("https://api.example/api/classifieds/authority"), env);
    expect(current.status).toBe(200);
    expect(await current.json()).toEqual({ authority: "worker" });
    expect(current.headers.get("cache-control")).toContain("no-store");
    await db.exec("DROP TABLE classifieds_authority");
    const requestId = "10000000-0000-4000-8000-000000000001";
    const failed = await worker.fetch(new Request("https://api.example/api/classifieds/authority", { headers: { "x-request-id": requestId } }), env);
    expect(failed.headers.get("x-request-id")).toBe(requestId);
    expect(failed.headers.get("x-classifieds-error-reported")).toBe("1");
    expect(failed.status).toBe(503);
    expect(logs).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logs.mock.calls[0]![0]))).toMatchObject({ requestId, route: "/api/classifieds/authority" });
  }
  finally { logs.mockRestore(); }
});
