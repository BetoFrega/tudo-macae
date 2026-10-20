import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore } from "../classifiedsPhotos";
import { photoLeaseMs } from "@tudomacae/classifieds-photos";
import { now, runtime, call, startRuntime, readRecord, readRecords, upload, photo, capability, draft, png, classifiedsDatabase } from "./photosRuntimeHarness";
type Retirement = NonNullable<Awaited<ReturnType<typeof readRecord>>>;
type PhotoBucket = Awaited<ReturnType<typeof runtime.getR2Bucket>>;
// Historical writers retained already-queued and unqueued cleanup references on the ad.
async function seedHistoricalCleanup(bucket: PhotoBucket, template: Retirement) {
  const paths: string[] = [];
  for (let index = 0; index < 16; index++) {
    const operationId = crypto.randomUUID();
    const path = `ad-images/ad/historical-${operationId}.png`;
    paths.push(path);
    const completed = index === 0;
    const digest = String(template.body.digest);
    const object = await bucket.put(path, completed ? new Uint8Array() : new Uint8Array(png), {
      customMetadata: { operationId, digest, ...(completed ? { classifiedsRetired: "1", originOutcome: "removed" } : {}) },
    });
    await call({ action: "save", records: [{ kind: "retirement", id: path, namespace: "classifieds_photos", body: {
      ...template.body, path, id: operationId, operationId, generation: object!.version,
      status: completed ? "retired" : "linked",
    } }, ...(index < 2 ? [{ kind: "adCleanup", id: createHash("sha256").update(path).digest("hex"), body: { adId: "ad", path, status: completed ? "completed" : "pending", dueAt: now, writerCompleted: true } }] : [])] });
  }
  return paths;
}
test.each(["update", "delete"] as const)("historical cleanup backlog survives bounded handoff, restart and purge failure (%s)", async (operation) => {
  const linked = photo.parse((await call({ action: "upload", request: upload() })).value);
  await capability("publications.publish", { id: "ad" });
  const store = { read: readRecord, page: readRecords };
  const template = (await store.read("retirement", linked.path, "classifieds_photos"))!;
  let bucket = await runtime.getR2Bucket("PHOTOS");
  const paths = await seedHistoricalCleanup(bucket, template);
  const shared = "ad-images/another/shared.png";
  const unmanaged = "ad-images/ad/unmanaged.png";
  await bucket.put(shared, new Uint8Array(png));
  await bucket.put(unmanaged, new Uint8Array(png));
  const current = (await store.read("ad", "ad"))!;
  await call({ action: "save", records: [
    { ...current, body: { ...current.body, pendingImageCleanupPaths: [...paths, shared, unmanaged] } },
    { kind: "retirement", id: shared, namespace: "classifieds_photos", body: { ...template.body, path: shared, ownerId: "another" } },
  ] });
  const result = operation === "delete"
    ? await capability("ads.delete", { id: "ad" })
    : await capability("ads.update", { ...draft, id: "ad", title: "Conteúdo preservado" });
  expect(result.error).toBeUndefined();
  if (operation === "delete") expect(await store.read("ad", "ad")).toBeNull();
  else expect((await store.read("ad", "ad"))?.body).toMatchObject({ title: "Conteúdo preservado", pendingImageCleanupPaths: [] });
  let jobs = (await store.page({ kind: "adCleanup" })).items;
  const manifest = jobs.find(job => job.body.stage === "handoff")!;
  expect(manifest.body.paths).toEqual(expect.arrayContaining(paths));
  const remainingPaths = operation === "delete" ? 9 : 8;
  const failed = await call({ action: "sweep", fault: "purge" });
  expect(failed.error).toBeUndefined();
  expect((await store.read("adCleanup", manifest.id))?.body.paths).toHaveLength(remainingPaths);
  expect((await store.read("adCleanup", createHash("sha256").update(paths[0]!).digest("hex")))?.body.status).toBe("completed");
  await runtime.dispose();
  startRuntime();
  await runtime.ready;
  bucket = await runtime.getR2Bucket("PHOTOS");
  expect((await store.read("adCleanup", manifest.id))?.body.paths).toHaveLength(remainingPaths);
  expect((await call({ action: "sweep", now: now + 60_000 })).error).toBeUndefined();
  expect((await call({ action: "sweep", now: now + photoLeaseMs })).error).toBeUndefined();
  expect((await store.read("adCleanup", manifest.id))?.body).toMatchObject({ status: "completed", paths: [] });
  jobs = (await store.page({ kind: "adCleanup" })).items;
  expect(jobs.filter(job => job.body.stage !== "handoff").every(job => job.body.status === "completed")).toBe(true);
  const retired = await call({ action: "heads", paths });
  expect(retired.error).toBeUndefined();
  expect(retired.value).toMatchObject(paths.map(() => ({ size: 0, customMetadata: { classifiedsRetired: "1" } })));
  expect(await bucket.head(shared)).toMatchObject({ size: png.length });
  expect(await bucket.head(unmanaged)).toMatchObject({ size: png.length });
});

test("cleanup queries stay bounded when expired individual jobs fill the queue", async () => {
  const db = await classifiedsDatabase();
  // Historical pending jobs can outlive the ad that created them.
  await db.exec(`INSERT INTO classifieds_records (kind, id, body, version) WITH RECURSIVE counts(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counts WHERE n < 1000) SELECT 'adCleanup', 'historical-' || n, json_object('adId', 'deleted', 'path', 'ad-images/deleted/' || n || '.png', 'status', 'pending', 'dueAt', 0), lower(hex(randomblob(16))) FROM counts;`);
  const queries: string[] = [];
  const observed = new Proxy(db, { get(target, key) {
    if (key === "prepare") return (query: string) => {
      queries.push(query);
      return target.prepare(query);
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const store = createClassifiedsPersistence({ database: db });
  expect(await createD1PhotoStore(observed, store).deletions(now, 25)).toHaveLength(25);
  expect(queries).toHaveLength(2);
  for (const [index, query] of queries.entries()) {
    const bindings = query.includes("LIMIT ?") ? [now, 25] : [now];
    const plan = await db.prepare(`EXPLAIN QUERY PLAN ${query}`).bind(...bindings).all<{ detail: string }>();
    expect(plan.results.map(row => row.detail).join(" ")).toContain(index === 0 ? "classifieds_photo_handoff_due" : "classifieds_photo_individual_deletion_due");
    const result = await db.prepare(query).bind(...bindings).all();
    expect(result.meta.rows_read).toBeLessThanOrEqual(100);
  }
});
test("ad deletion commits owned cleanup intents, resumes and preserves shared unmanaged files", async () => {
  const linked = photo.parse((await call({ action: "upload", request: upload() })).value);
  await capability("publications.publish", { id: "ad" });
  expect((await capability("ads.delete", { id: "ad" })).error).toBeUndefined();
  expect((await capability("ads.delete", { id: "ad" })).error).toBeUndefined();
  const db = await classifiedsDatabase();
  expect((await db.prepare("SELECT body FROM classifieds_records WHERE kind = 'adCleanup'").all()).results).toHaveLength(1);
  await call({ action: "sweep" });
  expect(await (await runtime.getR2Bucket("PHOTOS")).head(linked.path)).toMatchObject({ size: 0, customMetadata: { classifiedsRetired: "1" } });
  expect((await call({ action: "read", path: linked.path })).value).toBeNull();
});
