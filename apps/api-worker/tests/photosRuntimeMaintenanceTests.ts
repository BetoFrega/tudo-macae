import { expect, test } from "vitest";
import { z } from "zod";
import { createClassifiedsPersistence } from "../classifieds";
import { createD1PhotoStore } from "../classifiedsPhotos";
import { photoLeaseMs } from "@tudomacae/classifieds-photos";
import { now, runtime, options, call, upload, readRecord, classifiedsDatabase } from "./photosRuntimeHarness";

const scheduledTime = now + photoLeaseMs + 1;
async function schedule(qualification: string, fault = "") {
  Object.assign(options!.workers![0]!.config.env!, { QUALIFICATION: { type: "json", value: qualification }, MAINTENANCE_FAULT: { type: "json", value: fault } });
  await runtime.setOptions(options);
  return await (await runtime.getWorker()).scheduled({ scheduledTime: new Date(scheduledTime) });
}
async function seedAudits() {
  expect((await call({ action: "save", records: [
    { kind: "audit", id: "audit-expired", body: { expiresAt: scheduledTime } },
    { kind: "audit", id: "audit-future", body: { expiresAt: scheduledTime + 1 } },
  ] })).error).toBeUndefined();
}
const auditExists = async (id: string) => Boolean(await readRecord("audit", id));

test("hourly maintenance expires due audits only while Classifieds is qualified", async () => {
  await seedAudits();
  expect(await schedule("off")).toMatchObject({ outcome: "ok" });
  expect(await auditExists("audit-expired")).toBe(true);
  expect(await schedule("d1")).toMatchObject({ outcome: "ok" });
  expect(await auditExists("audit-expired")).toBe(false);
  expect(await auditExists("audit-future")).toBe(true);
});
test("a failing photo sweep still expires audits and the run reports failure", async () => {
  await seedAudits();
  expect(await schedule("d1", "photos")).toMatchObject({ outcome: "exception" });
  expect(await auditExists("audit-expired")).toBe(false);
});
test("failing audit expiry still sweeps photos and the run reports failure", async () => {
  expect((await call({ action: "save", records: [{ kind: "ad", id: "ad-expired", body: { userId: "owner", status: "active", publicationState: "pending", createdAt: now, images: [] } }] })).error).toBeUndefined();
  const reserved = await call({ action: "reserve", request: { ...upload(), ownerId: "ad-expired" }, now: now - 300_000 });
  const path = z.object({ path: z.string() }).parse(reserved.value).path;
  expect(await schedule("d1", "audits")).toMatchObject({ outcome: "exception" });
  const database = await classifiedsDatabase();
  const store = createD1PhotoStore(database, createClassifiedsPersistence({ database }));
  expect((await store.transact(tx => tx.photo(path)))?.status).toBe("retired");
});
