import { expect, test } from "vitest";
import { createOfferingCatalog, type OfferingCatalogState } from "../offeringCatalog";
test("owner prepares a hidden item before administrative enablement", async () => {
  let state: OfferingCatalogState = { enabled: false, revision: 0, items: [] };
  const catalog = createOfferingCatalog({
    store: {
      read: async () => state,
      transact: async (_id, change) => {
        const result = change(state, { ownerId: "owner", claimable: false });
        state = result.state;
        return state;
      },
    },
    flag: async () => "enabled",
    isPublicBusiness: async () => true,
    now: () => 1000,
    newId: () => "item-1",
  });
  await catalog.saveItem({ businessId: "business", actor: { id: "owner", admin: false }, expectedRevision: 0,
    item: { name: "Consulta", description: "", price: { mode: "fixed", amount: "12,34" } } });
  expect(await catalog.readManagement({ businessId: "business", actor: { id: "owner", admin: false } }))
    .toMatchObject({ enabled: false, items: [{ name: "Consulta", visible: false, price: { mode: "fixed", cents: 1234 } }] });
  expect(await catalog.readPublic("business")).toBeNull();
});
function fixture() {
  const states = new Map<string, OfferingCatalogState>();
  const audit: unknown[] = [];
  let enabled = true;
  let eligible = true;
  let sequence = 0;
  const catalog = createOfferingCatalog({
    store: {
      read: async id => states.get(id) ?? { enabled: false, revision: 0, items: [] },
      transact: async (id, change) => {
        const result = change(states.get(id) ?? { enabled: false, revision: 0, items: [] }, id === "claimable" ? { claimable: true } : { ownerId: "owner", claimable: false });
        states.set(id, result.state);
        if (result.audit)
          audit.push(result.audit);
        return result.state;
      },
    }, flag: async () => enabled ? "enabled" : "disabled",
    isPublicBusiness: async () => eligible, now: () => 1000, newId: () => `item-${++sequence}`,
  });
  return { catalog, audit, release: (value: boolean) => {
    enabled = value;
  }, eligibility: (value: boolean) => {
    eligible = value;
  } };
}
const owner = { id: "owner", admin: false };
const admin = { id: "admin", admin: true };
const consultation = { name: "Consulta", description: "Descrição", price: { mode: "on_request" } };
test("visibility, enablement, eligibility and flag combine without losing data or crossing businesses", async () => {
  const f = fixture();
  let state = await f.catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: 0, item: consultation });
  state = await f.catalog.setVisibility({ businessId: "a", actor: owner, expectedRevision: state.revision, itemId: "item-1", visible: true });
  expect(await f.catalog.readPublic("a")).toBeNull();
  state = await f.catalog.setEnablement({ businessId: "a", actor: admin, expectedRevision: state.revision, enabled: true, operationId: "enable" });
  expect(await f.catalog.readPublic("a")).toEqual({ items: [{ id: "item-1", ...consultation }] });
  expect(await f.catalog.readPublic("b")).toBeNull();
  f.release(false);
  expect(await f.catalog.readPublic("a")).toBeNull();
  await expect(f.catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: state.revision, item: consultation })).rejects.toMatchObject({ outcome: "disabled" });
  f.release(true);
  f.eligibility(false);
  expect(await f.catalog.readPublic("a")).toBeNull();
  f.eligibility(true);
  state = await f.catalog.setEnablement({ businessId: "a", actor: admin, expectedRevision: state.revision, enabled: false, operationId: "revoke" });
  expect(await f.catalog.readPublic("a")).toBeNull();
  state = await f.catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: state.revision, item: { ...consultation, id: "item-1", name: "Atualizado" } });
  expect(state.items[0]).toMatchObject({ name: "Atualizado", visible: true });
  expect(f.audit).toEqual([
    { actorId: "admin", businessId: "a", previous: false, enabled: true, at: 1000, operationId: "enable" },
    { actorId: "admin", businessId: "a", previous: true, enabled: false, at: 1000, operationId: "revoke" },
  ]);
});
test("third parties cannot edit and only administrators may enable", async () => {
  const { catalog } = fixture();
  await expect(catalog.saveItem({ businessId: "a", actor: { id: "third", admin: false }, expectedRevision: 0, item: consultation })).rejects.toMatchObject({ outcome: "authorization" });
  await expect(catalog.setEnablement({ businessId: "a", actor: owner, expectedRevision: 0, enabled: true, operationId: "enable" })).rejects.toMatchObject({ outcome: "authorization" });
  await expect(catalog.saveItem({ businessId: "claimable", actor: admin, expectedRevision: 0, item: consultation })).rejects.toMatchObject({ outcome: "validation", fieldErrors: { sourceUrl: expect.any(String) } });
  const state = await catalog.saveItem({ businessId: "claimable", actor: admin, expectedRevision: 0, item: { ...consultation, sourceUrl: "https://example.com/source" } });
  await catalog.setVisibility({ businessId: "claimable", actor: admin, expectedRevision: state.revision, itemId: "item-1", visible: true });
  await catalog.setEnablement({ businessId: "claimable", actor: admin, expectedRevision: 2, enabled: true, operationId: "enable" });
  expect(await catalog.readPublic("claimable")).toEqual({ items: [{ id: "item-1", ...consultation }] });
});
test("money is precise, edits keep visibility, stale revisions cannot overwrite", async () => {
  const { catalog } = fixture();
  let state = await catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: 0, item: { ...consultation, price: { mode: "from", amount: "0,29" } } });
  expect(state.items[0]?.price).toEqual({ mode: "from", cents: 29 });
  await expect(catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: 0, item: consultation })).rejects.toMatchObject({ outcome: "conflict" });
  state = await catalog.setVisibility({ businessId: "a", actor: owner, expectedRevision: 1, itemId: "item-1", visible: true });
  state = await catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: 2, item: { ...consultation, id: "item-1", price: { mode: "fixed", amount: "9999999.99" } } });
  expect(state.items[0]).toMatchObject({ visible: true, price: { mode: "fixed", cents: 999999999 } });
  for (const amount of ["1.001", "1e3", "-1", "NaN", "10000000", "1.000,00"]) {
    await expect(catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: state.revision, item: { ...consultation, price: { mode: "fixed", amount } } })).rejects.toMatchObject({ outcome: "validation" });
  }
});
test("enabled catalogs without visible items are unavailable and become unavailable after hiding the last item", async () => {
  const { catalog } = fixture();
  let state = await catalog.setEnablement({ businessId: "a", actor: admin, expectedRevision: 0, enabled: true, operationId: "enable" });
  expect(await catalog.readPublic("a")).toBeNull();
  state = await catalog.saveItem({ businessId: "a", actor: owner, expectedRevision: state.revision, item: consultation });
  expect(await catalog.readPublic("a")).toBeNull();
  state = await catalog.setVisibility({ businessId: "a", actor: owner, expectedRevision: state.revision, itemId: state.items[0]!.id, visible: true });
  expect(await catalog.readPublic("a")).not.toBeNull();
  await catalog.setVisibility({ businessId: "a", actor: owner, expectedRevision: state.revision, itemId: state.items[0]!.id, visible: false });
  expect(await catalog.readPublic("a")).toBeNull();
});
test("owners receive no administrative sources from reads or mutations while persisted sources remain available to administrators", async () => {
  const { catalog } = fixture();
  const sourceUrl = "https://example.com/internal-source";
  let state = await catalog.saveItem({ businessId: "a", actor: admin, expectedRevision: 0, item: { ...consultation, sourceUrl } });
  const id = state.items[0]!.id;
  expect(state.items[0]?.source).toEqual({ url: sourceUrl, checkedAt: 1000 });
  const input = { businessId: "a", actor: owner };
  expect((await catalog.readManagement(input)).items[0]).not.toHaveProperty("source");
  state = await catalog.saveItem({ ...input, expectedRevision: state.revision, item: { ...consultation, id, name: "Edited" } });
  expect(state.items[0]).not.toHaveProperty("source");
  state = await catalog.setVisibility({ ...input, expectedRevision: state.revision, itemId: id, visible: true });
  expect(state.items[0]).not.toHaveProperty("source");
  const administrative = await catalog.readManagement({ businessId: "a", actor: admin });
  expect(administrative.items[0]).toMatchObject({ name: "Edited", visible: true, source: { url: sourceUrl, checkedAt: 1000 } });
});
