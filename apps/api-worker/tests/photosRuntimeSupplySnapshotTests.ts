import { expect, test } from "vitest";
import { supplySnapshotColumns } from "@tudomacae/advertiser-identity/supplySnapshot";
import { now, runtime, options, call, readRecord } from "./photosRuntimeHarness";

// 1_800_000_000_000 is 2027-01-15T08:00Z, 05:00 in Macaé.
const snapshotKey = "classifieds-supply/date=2027-01-15/supply.csv";
async function schedule(qualification: string, scheduledTime = now, fault = "") {
  Object.assign(options!.workers![0]!.config.env!, { QUALIFICATION: { type: "json", value: qualification }, MAINTENANCE_FAULT: { type: "json", value: fault } });
  await runtime.setOptions(options);
  return await (await runtime.getWorker()).scheduled({ scheduledTime: new Date(scheduledTime) });
}
const exports = () => runtime.getR2Bucket("PDM_EXPORTS");

test("the production hourly run writes the day's supply snapshot without personal data, once per day", async () => {
  expect(await schedule("production")).toMatchObject({ outcome: "ok" });
  const snapshot = await (await exports()).get(snapshotKey);
  const csv = await snapshot!.text();
  const [header, ...rows] = csv.trimEnd().split("\n");
  expect(header).toBe(supplySnapshotColumns.join(","));
  expect(rows).toEqual([
    `2027-01-15,ad,ad,active,pending,false,,,,,,categoria,subcategoria,${now},${now}`,
    `2027-01-15,identity,profile,,,false,,true,false,true,false,,,${now},${now}`,
  ]);
  // The seed account id "owner" is also a substring of the has_owner header, so the exact rows above prove its absence.
  for (const personal of ["Perfil", "Anúncio", "Descrição", "22999998888"]) expect(csv).not.toContain(personal);

  expect((await call({ action: "save", records: [{ kind: "ad", id: "later", body: { userId: "owner", status: "active", createdAt: now } }] })).error).toBeUndefined();
  expect(await schedule("production", now + 60 * 60_000)).toMatchObject({ outcome: "ok" });
  expect(await (await (await exports()).get(snapshotKey))!.text()).toBe(csv);
  expect((await (await exports()).list()).objects.map(object => object.key)).toEqual([snapshotKey]);
});

test("a failing supply snapshot still expires audits and the run reports failure", async () => {
  expect((await call({ action: "save", records: [{ kind: "audit", id: "audit-expired", body: { expiresAt: now } }] })).error).toBeUndefined();
  expect(await schedule("d1", now, "supply")).toMatchObject({ outcome: "exception" });
  expect(await readRecord("audit", "audit-expired")).toBeNull();
});
