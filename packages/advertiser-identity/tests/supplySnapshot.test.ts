import { expect, test } from "vitest";
import { createSupplySnapshotExport, supplySnapshotColumns, type SupplySnapshotInventory } from "../supplySnapshot";
import type { AdvertiserProfileData } from "../model";

// 2026-10-25T01:30Z is still 24 October, 22:30, in Macaé (UTC-3).
const lateEvening = Date.UTC(2026, 9, 25, 1, 30);
const area = { categoryId: "food", subcategoryId: "bakery" };
const contact = { number: "22999998888", isWhatsapp: true };
const identity = (id: string, fields: Partial<AdvertiserProfileData> = {}): AdvertiserProfileData => ({
  id, title: `Nome ${id}`, description: `Descrição ${id}`, contacts: [contact], activityAreas: [area], createdAt: 10, updatedAt: 20, ...fields,
});

function fixture(inventory: Partial<SupplySnapshotInventory> = {}) {
  const files = new Map<string, string>();
  let reads = 0;
  const snapshot = createSupplySnapshotExport({
    store: { read: async () => {
      reads++;
      return { ads: [], identities: [], enabledCatalogs: new Set(), activityAreas: { isActive: async () => true }, ...inventory };
    } },
    destination: { exists: async date => files.has(date), write: async (date, csv) => void files.set(date, csv) },
  });
  return { snapshot, files, reads: () => reads };
}

function parse(csv: string) {
  const [header, ...lines] = csv.trimEnd().split("\n");
  return { header: header!.split(","), rows: lines.map(line => Object.fromEntries(line.split(",").map((value, index) => [supplySnapshotColumns[index], value]))) };
}

test("writes one row per Anúncio and Identidade anunciante with the agreed columns", async () => {
  const { snapshot, files } = fixture({
    ads: [
      { id: "live", status: "active", advertiserProfileId: "owned", categoryId: "food", subcategoryId: "bakery", createdAt: 1, updatedAt: 2 },
      { id: "paused", status: "paused", advertiserProfileId: "claimable", createdAt: 3 },
      { id: "untyped", createdAt: 4 },
      { id: "pending", status: "active", publicationState: "pending", createdAt: 5 },
      { id: "deleting", status: "active", deleting: true, createdAt: 6 },
    ],
    identities: [
      identity("owned", { userId: "account-1", identityType: "business" }),
      identity("claimable", { claimable: true, source: { url: "https://example.com", checkedAt: 1 } }),
      identity("personal", { userId: "account-2", identityType: "personal", contacts: [] }),
    ],
    enabledCatalogs: new Set(["owned"]),
  });

  expect(await snapshot.run(lateEvening)).toEqual({ snapshotDate: "2026-10-24", written: true, ads: 5, identities: 3 });
  const { header, rows } = parse(files.get("2026-10-24")!);
  expect(header).toEqual([...supplySnapshotColumns]);
  expect(rows).toEqual([
    { snapshot_date: "2026-10-24", kind: "ad", id: "live", status: "active", publication_state: "published", discoverable: "true", identity_type: "business", has_owner: "", claimable: "", has_contact: "", catalog_enabled: "", category_id: "food", subcategory_id: "bakery", created_at: "1", updated_at: "2" },
    expect.objectContaining({ id: "paused", status: "paused", discoverable: "false", identity_type: "business", updated_at: "3" }),
    expect.objectContaining({ id: "untyped", status: "paused", discoverable: "false", identity_type: "" }),
    expect.objectContaining({ id: "pending", status: "active", publication_state: "pending", discoverable: "false" }),
    expect.objectContaining({ id: "deleting", status: "active", discoverable: "false" }),
    { snapshot_date: "2026-10-24", kind: "identity", id: "owned", status: "", publication_state: "", discoverable: "true", identity_type: "business", has_owner: "true", claimable: "false", has_contact: "true", catalog_enabled: "true", category_id: "", subcategory_id: "", created_at: "10", updated_at: "20" },
    expect.objectContaining({ id: "claimable", discoverable: "true", identity_type: "business", has_owner: "false", claimable: "true", catalog_enabled: "false" }),
    expect.objectContaining({ id: "personal", discoverable: "false", identity_type: "personal", has_owner: "true", has_contact: "false" }),
  ]);
});

test("never writes names, descriptions, phone numbers or account ids", async () => {
  const { snapshot, files } = fixture({
    ads: [{ id: "ad", status: "active", advertiserProfileId: "owned", createdAt: 1, ...{ title: "Bicicleta", text: "Texto", userId: "account-1", contacts: [contact] } }],
    identities: [identity("owned", { userId: "account-1", identityType: "business" })],
  });
  await snapshot.run(lateEvening);
  const csv = files.get("2026-10-24")!;
  for (const value of ["Nome", "Descrição", "Bicicleta", "Texto", "account-1", contact.number]) expect(csv).not.toContain(value);
});

test("an Identidade anunciante is discoverable only with an active Área de atuação", async () => {
  const { snapshot, files } = fixture({ identities: [identity("owned", { userId: "account-1" })], activityAreas: { isActive: async () => false } });
  await snapshot.run(lateEvening);
  expect(parse(files.get("2026-10-24")!).rows[0]).toMatchObject({ id: "owned", discoverable: "false" });
});

test("writes once per Macaé calendar day and starts a new file the next day", async () => {
  const { snapshot, files, reads } = fixture({ ads: [{ id: "ad", status: "active", createdAt: 1 }] });
  await snapshot.run(lateEvening);
  expect(await snapshot.run(lateEvening + 60 * 60_000)).toEqual({ snapshotDate: "2026-10-24", written: false });
  expect(reads()).toBe(1);
  expect(await snapshot.run(lateEvening + 3 * 60 * 60_000)).toMatchObject({ snapshotDate: "2026-10-25", written: true });
  expect([...files.keys()]).toEqual(["2026-10-24", "2026-10-25"]);
});

test("quotes ids that would break the CSV", async () => {
  const { snapshot, files } = fixture({ ads: [{ id: "legado, \"antigo\"", status: "active", createdAt: 1 }] });
  await snapshot.run(lateEvening);
  expect(files.get("2026-10-24")).toContain("ad,\"legado, \"\"antigo\"\"\",active");
});
